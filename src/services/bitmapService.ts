import { Bitmap, IBitmap } from "../models/Bitmap";
import { Block, IBlock } from "../models/Blocks";
import { BestApiService } from "./bestApiService";
import { BitmapStorage } from "./bitmapStorageService";

export interface IBitmapEnriched extends IBitmap {
  block: IBlock | null;
}

interface SyncResult {
  success: boolean;
  syncedData: IBitmap[];
  syncedCount?: number;
  error?: string;
}

export class BitmapService {
  private static bitmapStorage: BitmapStorage = new BitmapStorage();

  static async syncBitmaps(): Promise<void> {
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
        100,
      );
    } catch (error) {}
  }

  static async filterValidBitmaps(
    inscriptionIds: string[],
  ): Promise<IBitmapEnriched[]> {
    const validBitmaps = (await Bitmap.find({
      inscription_id: { $in: inscriptionIds },
    })) as IBitmap[];

    const enriched = await Promise.all(
      validBitmaps.map(async (bitmap) => {
        const block = await Block.findOne({
          height: bitmap.genesis_height.toString(),
        });
        return { ...bitmap.toObject(), block } as IBitmapEnriched;
      }),
    );

    return enriched;
  }
}
