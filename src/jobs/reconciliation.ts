import { config } from "../config/env";
import { Order, IOrder, TERMINAL_STATES } from "../models/Order";
import { OrderService } from "../services/orderService";
import { OrdinalsBotService } from "../services/ordinalsBotService";

const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
// Only touch orders that haven't moved recently — fresh ones are being
// driven by webhooks/user actions.
const STALE_AFTER_MS = 2 * 60 * 1000;
// Unpaid orders older than this are dead regardless of what OB reports.
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

let running = false;

const reconcileOrder = async (order: IOrder): Promise<void> => {
  try {
    const obOrder = await OrdinalsBotService.getOrder(
      order.ordinalsbot_order_id,
    );
    await OrderService.applyRemoteState(order, obOrder, "reconcile");
  } catch (err) {
    console.error(
      `[reconcile] failed to reconcile ${order.ordinalsbot_order_id}:`,
      err,
    );
  }

  // Unpaid orders: past the payment window OB should have expired them (the
  // transition above handles that); if OB is unreachable or never expires
  // them, cut our side loose after 24h so they stop being swept.
  const unpaid =
    order.state === "pending_order" || order.state === "awaiting_signature";
  const age = Date.now() - order.createdAt.getTime();
  if (unpaid && age > ABANDON_AFTER_MS) {
    order.state = "abandoned";
    order.state_history.push({
      state: "abandoned",
      event: "state_transition",
      trigger: "reconcile",
      at: new Date(),
      meta: { reason: "unpaid past 24h" },
    });
    await order.save();
    console.log(
      `[reconcile] ${order.ordinalsbot_order_id}: abandoned (unpaid for ${Math.round(age / 3600000)}h)`,
    );
  }
};

export const runReconciliationSweep = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const orders = await Order.find({
      state: { $nin: TERMINAL_STATES },
      updatedAt: { $lt: staleBefore },
    });

    if (orders.length > 0) {
      console.log(`[reconcile] sweeping ${orders.length} stale order(s)`);
      for (const order of orders) {
        await reconcileOrder(order);
      }
      console.log(`[reconcile] sweep done`);
    }
  } catch (err) {
    console.error("[reconcile] sweep failed:", err);
  } finally {
    running = false;
  }
};

export const startReconciliationJob = (): NodeJS.Timeout => {
  console.log(
    `[reconcile] job started (every ${SWEEP_INTERVAL_MS / 1000}s, payment window ${config.paymentWindowMinutes}m)`,
  );
  // Run one sweep shortly after boot to catch anything missed while down
  setTimeout(() => void runReconciliationSweep(), 10_000);
  return setInterval(() => void runReconciliationSweep(), SWEEP_INTERVAL_MS);
};
