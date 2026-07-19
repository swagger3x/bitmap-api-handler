import { Request, Response } from "express";
import { OrderService } from "../services/orderService";
import { sendResponse } from "../utils/response";
import { CustomError } from "../utils/errors";

const handleError = (res: Response, error: unknown, context: string): void => {
  if (error instanceof CustomError) {
    sendResponse(res, error.statusCode, error.message);
    return;
  }
  console.error(`[order] ${context}:`, error);
  sendResponse(res, 500, "Internal server error");
};

export class OrderController {
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const {
        bitmap_inscription_id,
        receive_address,
        payment_address,
        payment_pubkey,
        dataURL,
        size,
      } = req.body;

      if (
        !bitmap_inscription_id ||
        !receive_address ||
        !payment_address ||
        !payment_pubkey ||
        !dataURL ||
        !size
      ) {
        sendResponse(
          res,
          400,
          "bitmap_inscription_id, receive_address, payment_address, payment_pubkey, dataURL and size are required",
        );
        return;
      }

      const order = await OrderService.createOrder({
        bitmapInscriptionId: bitmap_inscription_id,
        receiveAddress: receive_address,
        paymentAddress: payment_address,
        paymentPubkey: payment_pubkey,
        dataURL,
        size,
      });

      sendResponse(res, 201, "Order created", OrderService.toPublic(order));
    } catch (error) {
      handleError(res, error, "create failed");
    }
  }

  static async getActive(req: Request, res: Response): Promise<void> {
    try {
      const address = req.query.address as string;
      if (!address) {
        sendResponse(res, 400, "address query parameter is required");
        return;
      }
      const orders = await OrderService.getActiveOrders(address);
      sendResponse(res, 200, "Active orders retrieved", {
        orders: orders.map(OrderService.toPublic),
      });
    } catch (error) {
      handleError(res, error, "getActive failed");
    }
  }

  static async getOne(req: Request, res: Response): Promise<void> {
    try {
      const order = await OrderService.getOrder(req.params.id);
      sendResponse(res, 200, "Order retrieved", OrderService.toPublic(order));
    } catch (error) {
      handleError(res, error, "getOne failed");
    }
  }

  static async cancel(req: Request, res: Response): Promise<void> {
    try {
      const order = await OrderService.cancelOrder(req.params.id);
      sendResponse(res, 200, "Order cancelled", OrderService.toPublic(order));
    } catch (error) {
      handleError(res, error, "cancel failed");
    }
  }

  static async submitPsbt(req: Request, res: Response): Promise<void> {
    try {
      const { signedPsbt } = req.body;
      if (!signedPsbt || typeof signedPsbt !== "string") {
        sendResponse(res, 400, "signedPsbt is required");
        return;
      }
      const order = await OrderService.submitSignedPsbt(
        req.params.id,
        signedPsbt,
      );
      sendResponse(res, 200, "Payment broadcast", OrderService.toPublic(order));
    } catch (error) {
      handleError(res, error, "submitPsbt failed");
    }
  }
}
