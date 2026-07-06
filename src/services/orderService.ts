import { io } from "../app";
import { config } from "../config/env";
import {
  Order,
  IOrder,
  OrderState,
  OrderEventTrigger,
  TERMINAL_STATES,
} from "../models/Order";
import { Bitmap } from "../models/Bitmap";
import { BitmapService } from "./bitmapService";
import {
  OrdinalsBotService,
  OrdinalsBotOrder,
} from "./ordinalsBotService";
import { PsbtService } from "./psbtService";
import { MempoolService } from "./mempoolService";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";

// Progression rank: transitions never move backwards (e.g. OrdinalsBot still
// reports waiting-payment after we broadcast — that must not regress the order).
const STATE_RANK: Record<OrderState, number> = {
  pending_order: 0,
  awaiting_signature: 1,
  broadcast: 2,
  confirming: 3,
  completed: 4,
  failed: 4,
  expired: 4,
  abandoned: 4,
};

const FAILURE_STATES: OrderState[] = ["failed", "expired", "abandoned"];

const obStateToInternal = (obState: string): OrderState | null => {
  switch (obState) {
    case "prep":
    case "queued":
      return "pending_order";
    case "waiting-payment":
      return "awaiting_signature";
    case "payment-received":
    case "waiting-confirmation":
    case "mempool":
    case "memepool":
    case "inscribing":
    case "sent":
      return "confirming";
    case "completed":
      return "completed";
    case "error":
    case "payment-notenough":
      return "failed";
    case "expired":
    case "payment-expired":
      return "expired";
    default:
      return null; // unknown — logged by caller, no transition
  }
};

// Derives our internal state from an OrdinalsBot order. GET /order carries no
// lifecycle `state` string — only boolean flags plus `tx`/`sent` — while
// webhook payloads carry `state`. Flags win (they are the authoritative
// re-fetched data); the charge address appearing is the "ready for payment"
// signal.
const deriveRemoteState = (obOrder: OrdinalsBotOrder): OrderState | null => {
  if (obOrder.sent || obOrder.tx?.inscription) return "completed";
  if (obOrder.expired) return "expired";
  if (obOrder.underpaid) return "failed"; // single exact-amount PSBT — needs manual review
  if (obOrder.paid) return "confirming";
  if (typeof obOrder.state === "string") return obStateToInternal(obOrder.state);
  if (obOrder.charge?.address) return "awaiting_signature";
  return "pending_order";
};

export interface CreateOrderParams {
  bitmapInscriptionId: string;
  receiveAddress: string;
  paymentAddress: string;
  paymentPubkey: string;
  dataURL: string;
  size: number;
}

const publicOrder = (order: IOrder) => ({
  id: order.ordinalsbot_order_id,
  state: order.state,
  bitmapInscriptionId: order.bitmap_inscription_id,
  bitmapNumber: order.bitmap_number,
  psbt: order.state === "awaiting_signature" ? order.psbt_base64 : null,
  chargeAmount: order.charge.amount,
  platformFee: order.platform_fee.amount,
  txid: order.txid,
  dysonInscriptionId: order.dyson_inscription_id,
  createdAt: order.createdAt,
});

const emitOrderUpdate = (order: IOrder, extra: Record<string, unknown> = {}) => {
  io.to(`order_${order.ordinalsbot_order_id}`).emit("orderStatusUpdate", {
    ...publicOrder(order),
    ...extra,
  });
};

const logEvent = (
  order: IOrder,
  event: string,
  trigger: OrderEventTrigger,
  meta?: Record<string, unknown>,
) => {
  order.state_history.push({
    state: order.state,
    event,
    trigger,
    at: new Date(),
    meta,
  });
};

export class OrderService {
  static toPublic = publicOrder;

  static async createOrder(params: CreateOrderParams): Promise<IOrder> {
    const bitmap = await Bitmap.findOne({
      inscription_id: params.bitmapInscriptionId,
    });
    if (!bitmap) {
      // The bitmap index only holds mainnet data — on test networks, allow
      // orders for unknown bitmaps so the full workflow can be exercised.
      if (config.bitcoinNetwork === "mainnet") {
        throw new NotFoundError("Bitmap not found");
      }
      console.warn(
        `[order] test order for unindexed bitmap ${params.bitmapInscriptionId} (network=${config.bitcoinNetwork})`,
      );
    } else if (bitmap.dyson_inscription_id) {
      throw new ConflictError("This bitmap already has a dyson inscription");
    }
    const activeOrder = await Order.findOne({
      bitmap_inscription_id: params.bitmapInscriptionId,
      state: { $nin: TERMINAL_STATES },
    });
    if (activeOrder) {
      throw new ConflictError(
        `An active order (${activeOrder.ordinalsbot_order_id}) already exists for this bitmap`,
      );
    }
    if (!config.platformWallet) {
      throw new ValidationError("Platform wallet not configured");
    }

    const feeRate = await MempoolService.getRecommendedFeeRate();
    const obOrder = await OrdinalsBotService.createInscriptionOrder({
      dataURL: params.dataURL,
      size: params.size,
      receiveAddress: params.receiveAddress,
      feeRate,
    });

    const order = new Order({
      ordinalsbot_order_id: obOrder.id,
      bitmap_inscription_id: params.bitmapInscriptionId,
      bitmap_number: bitmap?.bitmap_number ?? -1,
      user_ordinals_address: params.receiveAddress,
      user_payment_address: params.paymentAddress,
      user_payment_pubkey: params.paymentPubkey,
      charge: {
        address: obOrder.charge?.address ?? null,
        amount: obOrder.charge?.amount ?? null,
      },
      platform_fee: {
        address: config.platformWallet,
        amount: config.platformFeeSats,
      },
      state: "pending_order",
    });
    logEvent(order, "order_created", "user", { obState: obOrder.state });
    await order.save();

    console.log(
      `[order] created ${obOrder.id} for bitmap ${bitmap?.bitmap_number ?? "unindexed"} (${params.bitmapInscriptionId})`,
    );
    return order;
  }

  // Single transition function used by webhook AND reconciliation.
  static async applyRemoteState(
    order: IOrder,
    obOrder: OrdinalsBotOrder,
    trigger: OrderEventTrigger,
  ): Promise<IOrder> {
    // Keep charge info fresh (available once OB reaches waiting-payment)
    if (obOrder.charge?.address && !order.charge.address) {
      order.charge.address = obOrder.charge.address;
      order.charge.amount = obOrder.charge.amount ?? order.charge.amount;
    }

    // Compact view of the remote signals for logs/audit trail
    const remote = {
      state: obOrder.state,
      paid: obOrder.paid,
      underpaid: obOrder.underpaid,
      expired: obOrder.expired,
      sent: obOrder.sent,
      inscription: obOrder.tx?.inscription,
      chargeAddress: obOrder.charge?.address,
    };

    const next = deriveRemoteState(obOrder);
    if (next === null) {
      console.warn(
        `[order] ${order.ordinalsbot_order_id}: unknown OrdinalsBot state (trigger=${trigger})`,
        remote,
      );
      logEvent(order, "unknown_remote_state", trigger, { remote });
      await order.save();
      return order;
    }

    const isTerminal = TERMINAL_STATES.includes(order.state);
    const regresses = STATE_RANK[next] <= STATE_RANK[order.state];
    const failure = FAILURE_STATES.includes(next);

    // Idempotency / no-regression: skip repeats and stale states, but always
    // allow a transition into a failure state from any non-terminal state.
    if (isTerminal || (regresses && !(failure && !isTerminal))) {
      if (next !== order.state) {
        logEvent(order, "remote_state_ignored", trigger, {
          remote,
          mapped: next,
          current: order.state,
        });
        await order.save();
      }
      return order;
    }

    const previous = order.state;
    order.state = next;
    logEvent(order, "state_transition", trigger, {
      from: previous,
      remote,
    });
    console.log(
      `[order] ${order.ordinalsbot_order_id}: ${previous} → ${next} (trigger=${trigger})`,
      remote,
    );

    if (next === "awaiting_signature") {
      await this.ensurePsbt(order, trigger);
    } else if (next === "completed") {
      // Inscription data lives on the top-level `tx` object of the order
      const inscriptionId = obOrder.tx?.inscription ?? null;
      if (inscriptionId) {
        order.dyson_inscription_id = inscriptionId;
        try {
          await BitmapService.recordDysonInscription(
            order.bitmap_inscription_id,
            inscriptionId,
          );
        } catch (err) {
          // Order still completes; reconciliation of the bitmap record is manual.
          console.error(
            `[order] ${order.ordinalsbot_order_id}: failed to record dyson inscription on bitmap:`,
            err,
          );
          logEvent(order, "dyson_record_failed", trigger, {
            inscriptionId,
            error: String(err),
          });
        }
      } else {
        console.warn(
          `[order] ${order.ordinalsbot_order_id}: completed but no inscription id in OB order`,
        );
        logEvent(order, "completed_without_inscription_id", trigger);
      }
    }

    await order.save();
    emitOrderUpdate(order, failure ? { error: obOrder.state } : {});
    return order;
  }

  // Builds (or rebuilds) the payment PSBT for an awaiting_signature order.
  // Safe to call repeatedly — no-op when a PSBT already exists.
  static async ensurePsbt(
    order: IOrder,
    trigger: OrderEventTrigger,
  ): Promise<void> {
    if (order.state !== "awaiting_signature" || order.psbt_base64) return;
    try {
      const built = await PsbtService.buildPaymentPsbt(order);
      order.psbt_base64 = built.psbtBase64;
      order.fee_rate = built.feeRate;
      order.expected_outputs = built.expectedOutputs;
      logEvent(order, "psbt_built", trigger, {
        feeRate: built.feeRate,
        outputs: built.expectedOutputs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[psbt] build failed for ${order.ordinalsbot_order_id}: ${message}`,
      );
      logEvent(order, "psbt_build_failed", trigger, { error: message });
      await order.save();
      emitOrderUpdate(order, { error: "psbt_build_failed", message });
      return;
    }
  }

  static async submitSignedPsbt(
    orderId: string,
    signedPsbtBase64: string,
  ): Promise<IOrder> {
    const order = await Order.findOne({ ordinalsbot_order_id: orderId });
    if (!order) throw new NotFoundError("Order not found");
    if (order.state !== "awaiting_signature") {
      throw new ConflictError(
        `Order is not awaiting a signature (state: ${order.state})`,
      );
    }

    let txid: string;
    try {
      txid = await PsbtService.validateAndBroadcast(order, signedPsbtBase64);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Persist the rejected attempt — the expected-vs-actual diff lives in
      // the error message. State is unchanged so the user can retry.
      logEvent(order, "psbt_rejected", "user", { error: message });
      await order.save();
      console.error(
        `[psbt] submission rejected for ${orderId}: ${message}`,
      );
      throw err;
    }

    order.txid = txid;
    order.state = "broadcast";
    logEvent(order, "state_transition", "user", {
      from: "awaiting_signature",
      txid,
    });
    await order.save();
    emitOrderUpdate(order);
    return order;
  }

  static async getOrder(orderId: string): Promise<IOrder> {
    const order = await Order.findOne({ ordinalsbot_order_id: orderId });
    if (!order) throw new NotFoundError("Order not found");
    // Self-heal: rebuild a missing PSBT on read (e.g. earlier build failed)
    if (order.state === "awaiting_signature" && !order.psbt_base64) {
      await this.ensurePsbt(order, "system");
      await order.save();
    }
    return order;
  }

  static async getActiveOrders(ordinalsAddress: string): Promise<IOrder[]> {
    const orders = await Order.find({
      user_ordinals_address: ordinalsAddress,
      state: { $nin: TERMINAL_STATES },
    }).sort({ createdAt: -1 });
    for (const order of orders) {
      if (order.state === "awaiting_signature" && !order.psbt_base64) {
        await this.ensurePsbt(order, "system");
        await order.save();
      }
    }
    return orders;
  }
}
