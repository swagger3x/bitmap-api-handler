import { Request, Response } from "express";
import { config } from "../config/env";
import { sendResponse } from "../utils/response";

interface OrdinalsBotOrder {
  id: string;
  state?: string;
  charge?: {
    address?: string;
    amount?: number;
  };
}

export class InscriptionController {
  static async createOrder(req: Request, res: Response): Promise<void> {
    if (!config.platformWallet) {
      res.status(500).json({ success: false, message: "Platform wallet not configured" });
      return;
    }

    try {
      const ordinalsRes = await fetch(`${config.ordinalsBotUrl}/inscribe`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      if (!ordinalsRes.ok) {
        const text = await ordinalsRes.text();
        res.status(ordinalsRes.status).json({ success: false, message: text });
        return;
      }

      const order = await ordinalsRes.json() as OrdinalsBotOrder;
      console.log("[inscriptions] order created: id=%s state=%s amount=%s", order.id, order.state, order.charge?.amount);

      // charge.address is not available yet (order is in "prep" state).
      // The webhook fires when OrdinalsBot transitions to "waiting-payment"
      // and the backend fetches the address at that point via socket.
      sendResponse(res, 200, "Order created", {
        id: order.id,
        charge: {
          amount: order.charge?.amount,
        },
        platform: {
          address: config.platformWallet,
          amount: config.platformFeeSats,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to create inscription order" });
    }
  }
}
