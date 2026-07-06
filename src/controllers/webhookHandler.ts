import { Request, Response } from "express";
import { Order } from "../models/Order";
import { OrderService } from "../services/orderService";
import { OrdinalsBotService } from "../services/ordinalsBotService";

// OrdinalsBot order status callback. The payload is untrusted (the endpoint
// is public and unsigned) — we only take the order id as a wake-up signal and
// re-fetch the authoritative state from the OrdinalsBot API.
export const webhookHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.body ?? {};

  if (!id || typeof id !== "string") {
    console.warn("[webhook] payload without order id:", JSON.stringify(req.body));
    res.sendStatus(400);
    return;
  }

  // Respond fast; processing continues after the 200.
  res.sendStatus(200);

  try {
    console.log(
      `[webhook] received for order ${id}: ${JSON.stringify(req.body)}`,
    );

    const order = await Order.findOne({ ordinalsbot_order_id: id });
    if (!order) {
      console.warn(`[webhook] unknown order id ${id} — ignored`);
      return;
    }

    // Persist the raw payload on the order's audit trail
    order.state_history.push({
      state: order.state,
      event: "webhook_received",
      trigger: "webhook",
      at: new Date(),
      meta: { payload: req.body },
    });
    await order.save();

    const obOrder = await OrdinalsBotService.getOrder(id);
    await OrderService.applyRemoteState(order, obOrder, "webhook");
  } catch (err) {
    console.error(`[webhook] processing failed for order ${id}:`, err);
    // Reconciliation will pick this order up on its next sweep.
  }
};
