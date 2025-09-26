import { Request, Response } from "express";
import { BitmapService } from "../services/bitmapService";
import { sendResponse } from "../utils/response";
import {
  NotFoundError,
  ExternalApiError,
  DatabaseError,
} from "../utils/errors";

export class BitmapController {
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

  static async validateBitmaps(req: Request, res: Response): Promise<void> {
    try {
      const inscriptions = req.body;
      const validBitmaps = await BitmapService.validateBitmaps(inscriptions);

      sendResponse(res, 200, "Bitmap validated successfully", validBitmaps);
    } catch (error: any) {
      if (error instanceof DatabaseError) {
        sendResponse(res, error.statusCode, error.message);
      } else if (error instanceof NotFoundError) {
        sendResponse(res, error.statusCode, error.message);
      } else {
        sendResponse(res, 500, "Internal server error");
      }
    }
  }

  //   static async getAllBitmaps(req: Request, res: Response): Promise<void> {
  //     try {
  //       const page = parseInt(req.query.page as string) || 1;
  //       const limit = parseInt(req.query.limit as string) || 10;
  //       const owner = req.query.owner as string;
  //       const minBitmap = parseInt(req.query.min_bitmap as string);
  //       const maxBitmap = parseInt(req.query.max_bitmap as string);

  //       const filters: any = {};
  //       if (owner) filters.owner = owner;
  //       if (!isNaN(minBitmap)) filters.min_bitmap_number = minBitmap;
  //       if (!isNaN(maxBitmap)) filters.max_bitmap_number = maxBitmap;

  //       const result = await BitmapService.getAllBitmaps(page, limit, filters);

  //       sendResponse(
  //         res,
  //         200,
  //         "Bitmaps retrieved successfully",
  //         {
  //           bitmaps: result.bitmaps,
  //         },
  //         {
  //           page: result.page,
  //           limit: result.limit,
  //           total: result.total,
  //           pages: result.pages,
  //         }
  //       );
  //     } catch (error: any) {
  //       sendResponse(res, 500, "Internal server error");
  //     }
  //   }

  //   static async getBitmap(req: Request, res: Response): Promise<void> {
  //     try {
  //       const bitmap = await BitmapService.getBitmapById(req.params.id);
  //       sendResponse(res, 200, "Bitmap retrieved successfully", { bitmap });
  //     } catch (error: any) {
  //       if (error instanceof NotFoundError) {
  //         sendResponse(res, error.statusCode, error.message);
  //       } else {
  //         sendResponse(res, 500, "Internal server error");
  //       }
  //     }
  //   }

  //   static async getBitmapByInscription(
  //     req: Request,
  //     res: Response
  //   ): Promise<void> {
  //     try {
  //       const bitmap = await BitmapService.getBitmapByInscriptionId(
  //         req.params.inscriptionId
  //       );
  //       sendResponse(res, 200, "Bitmap retrieved successfully", { bitmap });
  //     } catch (error: any) {
  //       if (error instanceof NotFoundError) {
  //         sendResponse(res, error.statusCode, error.message);
  //       } else {
  //         sendResponse(res, 500, "Internal server error");
  //       }
  //     }
  //   }

  //   static async getBitmapsByOwner(req: Request, res: Response): Promise<void> {
  //     try {
  //       const bitmaps = await BitmapService.getBitmapsByOwner(req.params.owner);
  //       sendResponse(res, 200, "Bitmaps retrieved successfully", { bitmaps });
  //     } catch (error: any) {
  //       sendResponse(res, 500, "Internal server error");
  //     }
  //   }

  //   static async searchBitmaps(req: Request, res: Response): Promise<void> {
  //     try {
  //       const query = req.query.q as string;
  //       if (!query) {
  //         sendResponse(res, 400, "Search query is required");
  //         return;
  //       }

  //       const bitmaps = await BitmapService.searchBitmaps(query);
  //       sendResponse(res, 200, "Search results", { bitmaps });
  //     } catch (error: any) {
  //       sendResponse(res, 500, "Internal server error");
  //     }
  //   }
}
