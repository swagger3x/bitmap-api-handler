import { Bitmap, IBitmap } from "../models/Bitmap";
import { BestApiService } from "./bestApiService";
import { NotFoundError } from "../utils/errors";

export class BitmapService {
  static async syncBitmaps(): Promise<void> {
    const externalBitmaps = await BestApiService.fetchBitmaps(
      "inscr_num",
      "asc",
      1,
      100
    );
    for (const externalBitmap of externalBitmaps) {
      try {
        const existingBitmap = await Bitmap.findOne({
          bitmap_number: externalBitmap.bitmap_number,
        });
        if (existingBitmap) {
          continue;
        } else {
          // Create new record
          await Bitmap.create(externalBitmap);
        }
      } catch (error) {
        console.error(
          `Error processing bitmap ${externalBitmap.inscription_id}:`,
          error
        );
      }
    }
  }
  //   static async getAllBitmaps(
  //     page: number = 1,
  //     limit: number = 10,
  //     filters: {
  //       owner?: string;
  //       min_bitmap_number?: number;
  //       max_bitmap_number?: number;
  //     } = {}
  //   ): Promise<{
  //     bitmaps: IBitmap[];
  //     total: number;
  //     pages: number;
  //     page: number;
  //     limit: number;
  //   }> {
  //     const skip = (page - 1) * limit;
  //     // Build filter query
  //     const filterQuery: any = {};
  //     if (filters.owner) {
  //       filterQuery.owner_wallet_addr = filters.owner;
  //     }
  //     if (filters.min_bitmap_number !== undefined) {
  //       filterQuery.bitmap_number = {
  //         ...filterQuery.bitmap_number,
  //         $gte: filters.min_bitmap_number,
  //       };
  //     }
  //     if (filters.max_bitmap_number !== undefined) {
  //       filterQuery.bitmap_number = {
  //         ...filterQuery.bitmap_number,
  //         $lte: filters.max_bitmap_number,
  //       };
  //     }
  //     const [bitmaps, total] = await Promise.all([
  //       Bitmap.find(filterQuery)
  //         .sort({ bitmap_number: 1 })
  //         .skip(skip)
  //         .limit(limit)
  //         .select("-__v"),
  //       Bitmap.countDocuments(filterQuery),
  //     ]);
  //     return {
  //       bitmaps,
  //       total,
  //       pages: Math.ceil(total / limit),
  //       page,
  //       limit,
  //     };
  //   }
  //   static async getBitmapById(id: string): Promise<IBitmap> {
  //     const bitmap = await Bitmap.findById(id);
  //     if (!bitmap) {
  //       throw new NotFoundError("Bitmap not found");
  //     }
  //     return bitmap;
  //   }
  //   static async getBitmapByInscriptionId(
  //     inscriptionId: string
  //   ): Promise<IBitmap> {
  //     const bitmap = await Bitmap.findOne({ inscription_id: inscriptionId });
  //     if (!bitmap) {
  //       throw new NotFoundError("Bitmap not found");
  //     }
  //     return bitmap;
  //   }
  //   static async getBitmapsByOwner(owner: string): Promise<IBitmap[]> {
  //     return await Bitmap.find({ owner_wallet_addr: owner })
  //       .sort({ bitmap_number: 1 })
  //       .select("-__v");
  //   }
  //   static async searchBitmaps(query: string): Promise<IBitmap[]> {
  //     return await Bitmap.find({
  //       $or: [
  //         { inscription_id: { $regex: query, $options: "i" } },
  //         { owner_wallet_addr: { $regex: query, $options: "i" } },
  //       ],
  //     })
  //       .sort({ bitmap_number: 1 })
  //       .limit(50)
  //       .select("-__v");
  //   }
}
