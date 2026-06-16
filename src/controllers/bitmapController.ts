import { Request, Response } from "express";
import { BitmapService } from "../services/bitmapService";
import { sendResponse } from "../utils/response";
import {
  NotFoundError,
  ExternalApiError,
  DatabaseError,
} from "../utils/errors";

export class BitmapController {
  static async filterBitmaps(req: Request, res: Response): Promise<void> {
    try {
      const { inscription_ids } = req.body;

      if (!Array.isArray(inscription_ids) || inscription_ids.length === 0) {
        sendResponse(res, 400, "inscription_ids must be a non-empty array");
        return;
      }

      const result = await BitmapService.filterValidBitmaps(inscription_ids);
      sendResponse(res, 200, "Bitmaps retrieved successfully", result);
    } catch (error: any) {
      sendResponse(res, 500, "Internal server error");
    }
  }

  static async recordDyson(req: Request, res: Response): Promise<void> {
    try {
      const { inscriptionId } = req.params;
      const { dyson_inscription_id } = req.body;

      if (!dyson_inscription_id) {
        sendResponse(res, 400, "dyson_inscription_id is required");
        return;
      }

      const updated = await BitmapService.recordDysonInscription(
        inscriptionId,
        dyson_inscription_id,
      );

      if (!updated) {
        sendResponse(res, 404, "Bitmap not found");
        return;
      }

      sendResponse(res, 200, "Dyson inscription recorded", { bitmap: updated });
    } catch (error: any) {
      sendResponse(res, 500, "Internal server error");
    }
  }

  static async syncBitmaps(req: Request, res: Response): Promise<void> {
    try {
      const result = await BitmapService.syncBitmaps();

      sendResponse(res, 200, "Bitmaps synchronized successfully", {});
    } catch (error: any) {
      if (error instanceof ExternalApiError) {
        sendResponse(res, error.statusCode, error.message);
      } else {
        sendResponse(res, 500, "Internal server error");
      }
    }
  }
}
