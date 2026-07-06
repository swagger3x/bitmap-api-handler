import mongoose, { Document, Schema } from "mongoose";

// Internal order lifecycle. Single source of truth shared with the frontend
// stepper — OrdinalsBot states are mapped onto these in orderService.
export type OrderState =
  | "pending_order" // created at OrdinalsBot, waiting for waiting-payment
  | "awaiting_signature" // PSBT built and delivered, waiting for signed PSBT
  | "broadcast" // payment tx broadcast by us
  | "confirming" // OrdinalsBot saw the payment / is inscribing
  | "completed"
  | "failed"
  | "expired"
  | "abandoned";

export const TERMINAL_STATES: OrderState[] = [
  "completed",
  "failed",
  "expired",
  "abandoned",
];

export type OrderEventTrigger = "webhook" | "reconcile" | "user" | "system";

// Audit trail entry. Also used for non-transition events (webhook receipts,
// rejected PSBT submissions, broadcast errors) so one document holds the full
// story of a mint — meta carries the payload/diff/error for manual resolution.
export interface IOrderEvent {
  state: OrderState;
  event?: string;
  trigger: OrderEventTrigger;
  at: Date;
  meta?: Record<string, unknown>;
}

export interface IOrder extends Document {
  ordinalsbot_order_id: string;
  bitmap_inscription_id: string;
  bitmap_number: number;
  user_ordinals_address: string;
  user_payment_address: string;
  user_payment_pubkey: string;
  charge: { address: string | null; amount: number | null };
  platform_fee: { address: string; amount: number };
  expected_outputs: { address: string; value: number }[];
  psbt_base64: string | null;
  fee_rate: number | null;
  txid: string | null;
  dyson_inscription_id: string | null;
  state: OrderState;
  state_history: IOrderEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderEventSchema = new Schema<IOrderEvent>(
  {
    state: { type: String, required: true },
    event: { type: String },
    trigger: { type: String, required: true },
    at: { type: Date, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const OrderSchema: Schema = new Schema(
  {
    ordinalsbot_order_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    bitmap_inscription_id: {
      type: String,
      required: true,
      index: true,
    },
    bitmap_number: {
      type: Number,
      required: true,
    },
    user_ordinals_address: {
      type: String,
      required: true,
    },
    user_payment_address: {
      type: String,
      required: true,
      index: true,
    },
    user_payment_pubkey: {
      type: String,
      required: true,
    },
    charge: {
      address: { type: String, default: null },
      amount: { type: Number, default: null },
    },
    platform_fee: {
      address: { type: String, required: true },
      amount: { type: Number, required: true },
    },
    expected_outputs: {
      type: [{ address: String, value: Number }],
      default: [],
    },
    psbt_base64: {
      type: String,
      default: null,
    },
    fee_rate: {
      type: Number,
      default: null,
    },
    txid: {
      type: String,
      default: null,
    },
    dyson_inscription_id: {
      type: String,
      default: null,
    },
    state: {
      type: String,
      required: true,
      default: "pending_order",
      index: true,
    },
    state_history: {
      type: [OrderEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Resume-on-load lookup: active orders for a connected wallet
OrderSchema.index({ user_ordinals_address: 1, state: 1 });
// Double-mint guard lookup: active order for a bitmap
OrderSchema.index({ bitmap_inscription_id: 1, state: 1 });

export const Order = mongoose.model<IOrder>("order", OrderSchema, "orders");
