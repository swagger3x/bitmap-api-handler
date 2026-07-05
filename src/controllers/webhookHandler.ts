import { Request, Response } from "express";
import { io } from "../app";
import { config } from "../config/env";

export const webhookHandler = async (req: Request, res: Response): Promise<void> => {
  const { id, state } = req.body;

  if (!id) {
    console.warn("[webhook] received payload without order id:", req.body);
    res.sendStatus(400);
    return;
  }

  console.log(`[webhook] order ${id} → ${state}`);

  let chargeAddress: string | undefined;
  let chargeAmount: number | undefined;

  if (state === "waiting-payment") {
    try {
      const orderRes = await fetch(`${config.ordinalsBotUrl}/order?id=${id}`);
      if (orderRes.ok) {
        const order = await orderRes.json() as { charge?: { address?: string; amount?: number } };
        chargeAddress = order.charge?.address;
        chargeAmount = order.charge?.amount;
        console.log(`[webhook] charge ready for ${id}: address=${chargeAddress} amount=${chargeAmount}`);
      }
    } catch (err) {
      console.error("[webhook] failed to fetch order status:", err);
    }
  }

  io.to(`order_${id}`).emit("orderStatusUpdate", { id, state, chargeAddress, chargeAmount });

  res.sendStatus(200);
};
