import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { config, BitcoinNetwork } from "../config/env";
import { MempoolService, Utxo } from "./mempoolService";
import { ValidationError } from "../utils/errors";
import { IOrder } from "../models/Order";

bitcoin.initEccLib(ecc);

// testnet4 and signet share testnet address prefixes
const NETWORKS: Record<BitcoinNetwork, bitcoin.networks.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  testnet4: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet,
};

const network = NETWORKS[config.bitcoinNetwork] || bitcoin.networks.bitcoin;

const DUST_LIMIT = 546;
// UTXOs at/below this are skipped: the payment address should never hold
// inscriptions, but postage-sized outputs are cheap insurance to leave alone.
const POSTAGE_SAFETY_LIMIT = 1000;

type AddressType = "p2wpkh" | "p2sh-p2wpkh" | "p2tr" | "p2pkh";

// Approximate vbytes per input/output by script type (conservative).
const INPUT_VSIZE: Record<AddressType, number> = {
  p2wpkh: 68,
  "p2sh-p2wpkh": 91,
  p2tr: 58,
  p2pkh: 148,
};
const OUTPUT_VSIZE = 43; // p2tr output, the largest common case
const TX_OVERHEAD_VSIZE = 11;

export interface BuiltPsbt {
  psbtBase64: string;
  feeRate: number;
  expectedOutputs: { address: string; value: number }[];
}

const detectAddressType = (address: string): AddressType => {
  const lower = address.toLowerCase();
  if (lower.startsWith("bc1p") || lower.startsWith("tb1p")) return "p2tr";
  if (lower.startsWith("bc1q") || lower.startsWith("tb1q")) return "p2wpkh";
  if (address.startsWith("3") || address.startsWith("2")) return "p2sh-p2wpkh";
  return "p2pkh";
};

const toXOnly = (pubkey: Buffer): Buffer =>
  pubkey.length === 32 ? pubkey : pubkey.subarray(1, 33);

export class PsbtService {
  // Builds the unsigned payment PSBT for an order:
  //   out[0] OrdinalsBot charge, out[1] platform fee, out[2] change (if > dust)
  static async buildPaymentPsbt(order: IOrder): Promise<BuiltPsbt> {
    const chargeAddress = order.charge.address;
    const chargeAmount = order.charge.amount;
    if (!chargeAddress || !chargeAmount) {
      throw new ValidationError("Order has no charge information yet");
    }

    const paymentAddress = order.user_payment_address;
    const addressType = detectAddressType(paymentAddress);
    const pubkey = Buffer.from(order.user_payment_pubkey, "hex");

    const [allUtxos, feeRate] = await Promise.all([
      MempoolService.getUtxos(paymentAddress),
      MempoolService.getRecommendedFeeRate(),
    ]);

    const spendable = allUtxos
      .filter((u) => u.value > POSTAGE_SAFETY_LIMIT)
      // confirmed first, then largest first
      .sort((a, b) =>
        a.confirmed === b.confirmed
          ? b.value - a.value
          : a.confirmed
            ? -1
            : 1,
      );

    const target = chargeAmount + order.platform_fee.amount;

    // Accumulate inputs until they cover target + network fee for the
    // resulting tx size (3 outputs: charge, platform fee, change).
    const selected: Utxo[] = [];
    let inputSum = 0;
    let fee = 0;
    for (const utxo of spendable) {
      selected.push(utxo);
      inputSum += utxo.value;
      fee = Math.ceil(
        (TX_OVERHEAD_VSIZE +
          selected.length * INPUT_VSIZE[addressType] +
          3 * OUTPUT_VSIZE) *
          feeRate,
      );
      if (inputSum >= target + fee) break;
    }

    if (inputSum < target + fee) {
      throw new ValidationError(
        `Insufficient funds: need ~${target + fee} sats (charge ${chargeAmount} + platform fee ${order.platform_fee.amount} + network fee ~${fee}), ` +
          `spendable balance ${inputSum} sats on ${paymentAddress}`,
      );
    }

    const psbt = new bitcoin.Psbt({ network });
    const paymentScript = bitcoin.address.toOutputScript(paymentAddress, network);

    for (const utxo of selected) {
      const input: Parameters<bitcoin.Psbt["addInput"]>[0] = {
        hash: utxo.txid,
        index: utxo.vout,
      };

      if (addressType === "p2pkh") {
        const rawHex = await MempoolService.getRawTxHex(utxo.txid);
        input.nonWitnessUtxo = Buffer.from(rawHex, "hex");
      } else {
        input.witnessUtxo = { script: paymentScript, value: utxo.value };
        if (addressType === "p2sh-p2wpkh") {
          const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network });
          input.redeemScript = p2wpkh.output;
        } else if (addressType === "p2tr") {
          input.tapInternalKey = toXOnly(pubkey);
        }
      }

      psbt.addInput(input);
    }

    const expectedOutputs: { address: string; value: number }[] = [
      { address: chargeAddress, value: chargeAmount },
      { address: order.platform_fee.address, value: order.platform_fee.amount },
    ];

    const change = inputSum - target - fee;
    if (change > DUST_LIMIT) {
      expectedOutputs.push({ address: paymentAddress, value: change });
    }
    // else: sub-dust change is absorbed into the network fee

    for (const out of expectedOutputs) {
      psbt.addOutput({ address: out.address, value: out.value });
    }

    console.log(
      `[psbt] built for order ${order.ordinalsbot_order_id}: ${selected.length} input(s), ` +
        `charge=${chargeAmount} platformFee=${order.platform_fee.amount} networkFee=${fee} change=${Math.max(change, 0)} feeRate=${feeRate}`,
    );

    return { psbtBase64: psbt.toBase64(), feeRate, expectedOutputs };
  }

  // Validates a signed PSBT against what we issued, finalizes, broadcasts.
  // Throws ValidationError with an expected-vs-actual diff on any mismatch.
  static async validateAndBroadcast(
    order: IOrder,
    signedPsbtBase64: string,
  ): Promise<string> {
    if (!order.psbt_base64) {
      throw new ValidationError("No PSBT was issued for this order");
    }

    let signed: bitcoin.Psbt;
    try {
      signed = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network });
    } catch {
      throw new ValidationError("Signed PSBT could not be parsed");
    }

    const issued = bitcoin.Psbt.fromBase64(order.psbt_base64, { network });

    // Inputs: exact same prevouts, same order, nothing added or removed.
    const prevouts = (p: bitcoin.Psbt) =>
      p.txInputs.map(
        (i) => `${Buffer.from(i.hash).reverse().toString("hex")}:${i.index}`,
      );
    const issuedInputs = prevouts(issued);
    const signedInputs = prevouts(signed);
    if (JSON.stringify(issuedInputs) !== JSON.stringify(signedInputs)) {
      throw new ValidationError(
        `PSBT inputs were modified. expected=${JSON.stringify(issuedInputs)} actual=${JSON.stringify(signedInputs)}`,
      );
    }

    // Outputs: exactly the expected set — address and value.
    const actualOutputs = signed.txOutputs.map((o) => ({
      address: bitcoin.address.fromOutputScript(o.script, network),
      value: o.value,
    }));
    const expected = order.expected_outputs.map((o) => ({
      address: o.address,
      value: o.value,
    }));
    if (JSON.stringify(actualOutputs) !== JSON.stringify(expected)) {
      throw new ValidationError(
        `PSBT outputs were modified. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actualOutputs)}`,
      );
    }

    // Finalize any inputs the wallet didn't finalize itself.
    signed.data.inputs.forEach((input, idx) => {
      if (!input.finalScriptSig && !input.finalScriptWitness) {
        signed.finalizeInput(idx);
      }
    });

    const txHex = signed.extractTransaction().toHex();
    const txid = await MempoolService.broadcastTx(txHex);
    console.log(`[psbt] broadcast for order ${order.ordinalsbot_order_id}: txid=${txid}`);
    return txid;
  }
}
