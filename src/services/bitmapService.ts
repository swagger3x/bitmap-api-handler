import { Bitmap, IBitmap } from "../models/Bitmap";
import { BestApiService } from "./bestApiService";
import { BitmapStorage } from "./bitmapStorageService";

interface SyncResult {
  success: boolean;
  syncedData: IBitmap[];
  syncedCount?: number;
  error?: string;
}

interface InscriptionData {
  inscription_number: number;
  inscription_id: string;
  content_body_preview: string;
  created_at: number;
  [key: string]: unknown;
}

export class BitmapService {
  private static bitmapStorage: BitmapStorage = new BitmapStorage();

  static async syncBitmaps(): Promise<SyncResult> {
    try {
      // Get last_offset
      const bitmapState = await this.bitmapStorage.getLastState();
      const lastOffset = bitmapState.offset;
      const lastBlockHeight = bitmapState.block_height;
      const paramOffset = Math.floor(lastOffset / 20) * 20;

      // Fetch new ordered bitmaps
      const newOrderedBitmaps = await BestApiService.fetchBitmaps(
        "inscr_num",
        "asc",
        paramOffset,
        100
      );
      if (!newOrderedBitmaps) {
        console.log("Failed to fetch data, keeping sync data...");
        return {
          success: false,
          syncedData: [],
        };
      }

      const bitmapData = newOrderedBitmaps.data;
      const blockHeight = newOrderedBitmaps.block_height;

      const skipCount = lastOffset - paramOffset;
      const newBitmapData = bitmapData.slice(skipCount);

      if (newBitmapData) {
        console.log(`Fetched ${newBitmapData.length()} new records`);
        const success = await this.bitmapStorage.storeBitmapData(newBitmapData);
        const newOffset = lastOffset + newBitmapData.length();
        await this.bitmapStorage.updateState(newOffset, blockHeight);
        if (!success) console.log("Failed to store bitmap data");
        if (bitmapData.length() < 100) {
          console.log("No more available bitmap data now.");
          return {
            success: true,
            syncedData: newBitmapData,
          };
        } else {
          this.syncBitmaps();
        }
      }

      return {
        success: true,
        syncedData: [],
        syncedCount: 0,
      };
    } catch (error) {
      return {
        success: false,
        syncedData: [],
        syncedCount: 0,
      };
    }
  }

  static async validateBitmaps(
    inscriptions: InscriptionData[]
  ): Promise<InscriptionData[]> {
    const validBitmaps: InscriptionData[] = [];

    for (const inscription of inscriptions) {
      const contentNumberMatch =
        inscription.content_body_preview?.match(/^(\d+)\.bitmap$/);

      if (!contentNumberMatch) {
        continue;
      }

      const contentNumber = parseInt(contentNumberMatch[1], 10);
      if (
        inscription.created_at == null ||
        inscription.created_at < contentNumber
      ) {
        continue;
      }

      try {
        const bitmapDocument = await this.bitmapStorage.getBitmapByID(
          inscription.inscription_id
        );

        if (bitmapDocument && bitmapDocument.bitmap_number === contentNumber) {
          validBitmaps.push(inscription);
        }
      } catch (error) {
        console.error(
          `Error fetching bitmap for inscription ${inscription.inscription_id}:`,
          error
        );
        // continue automatically since loop just moves to next iteration
      }
    }

    return validBitmaps;
  }

  static async filterValidBitmaps(): Promise<void> {}
}
