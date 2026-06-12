// src/controllers/webhookController.ts
import { Request, Response } from "express";
import { io } from "../app";

export const webhookHandler = (req: Request, res: Response) => {
  const { id, state } = req.body;

  if (!id) {
    console.warn("[webhook] received payload without order id:", req.body);
    res.sendStatus(400);
    return;
  }

  console.log(`[webhook] order ${id} → ${state}`);

  // Emit only to sockets subscribed to this order
  io.to(`order_${id}`).emit("orderStatusUpdate", { id, state });

  res.sendStatus(200);
};
