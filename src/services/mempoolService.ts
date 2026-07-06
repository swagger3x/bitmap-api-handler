import { config } from "../config/env";
import { ExternalApiError } from "../utils/errors";

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

export class MempoolService {
  private static async request(path: string): Promise<Response> {
    const res = await fetch(`${config.mempoolApiUrl}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new ExternalApiError(
        `mempool.space request failed: ${path} → HTTP ${res.status}`,
      );
    }
    return res;
  }

  static async getUtxos(address: string): Promise<Utxo[]> {
    const res = await this.request(`/address/${address}/utxo`);
    const utxos = (await res.json()) as {
      txid: string;
      vout: number;
      value: number;
      status: { confirmed: boolean };
    }[];
    return utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status?.confirmed ?? false,
    }));
  }

  static async getRecommendedFeeRate(): Promise<number> {
    try {
      const res = await this.request("/v1/fees/recommended");
      const fees = (await res.json()) as { halfHourFee?: number };
      if (fees.halfHourFee && fees.halfHourFee > 0) return fees.halfHourFee;
    } catch (err) {
      console.warn("[psbt] fee estimate failed, using fallback:", err);
    }
    return config.fallbackFeeRate;
  }

  // Needed as nonWitnessUtxo when spending from legacy (P2PKH) addresses.
  static async getRawTxHex(txid: string): Promise<string> {
    const res = await this.request(`/tx/${txid}/hex`);
    return res.text();
  }

  static async broadcastTx(txHex: string): Promise<string> {
    const res = await fetch(`${config.mempoolApiUrl}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: txHex,
    });
    const body = await res.text();
    if (!res.ok) {
      throw new ExternalApiError(
        `Broadcast failed: HTTP ${res.status} ${body}`,
      );
    }
    return body.trim(); // txid
  }
}
