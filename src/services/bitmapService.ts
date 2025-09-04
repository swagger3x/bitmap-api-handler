import { Bitmap, IBitmap } from "../models/Bitmap";
import { BestApiService } from "./bestApiService";
import { BitmapStorage } from "./bitmapStorageService";

interface SyncResult {
  success: boolean;
  syncedData: IBitmap[];
  syncedCount?: number;
  error?: string;
}

export class BitmapService {
  private static bitmapStorage: BitmapStorage = new BitmapStorage();

  static async syncBitmaps(): Promise<SyncResult> {
    try {
      // Get last_offset
      const bitmapState = await this.bitmapStorage.getLastState();
      const lastOffset = bitmapState.offset;

      // Fetch new ordered bitmaps
      const newoffest = lastOffset + 100;
      const newOrderedBitmaps = await BestApiService.fetchBitmaps(
        "inscr_num",
        "asc",
        newoffest,
        100
      );
    } catch (error) {}
  }

  static async filterValidBitmaps(): Promise<void> {}
}
