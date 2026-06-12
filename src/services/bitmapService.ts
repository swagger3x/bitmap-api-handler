import { Bitmap, IBitmap } from "../models/Bitmap";
import { Block, IBlock } from "../models/Blocks";
import { BitmapState } from "../models/State";
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

  static async filterValidBitmaps(inscriptionIds: string[]): Promise<{
    bitmaps: IBitmapEnriched[];
    last_synced_at: Date | null;
    last_synced_block_height: number | null;
  }> {
    const validBitmaps = (await Bitmap.find({
      inscription_id: { $in: inscriptionIds },
    })) as IBitmap[];

    // Batch the block lookup: two indexed queries total regardless of wallet size
    const heights = [
      ...new Set(validBitmaps.map((b) => b.genesis_height.toString())),
    ];
    const blocks = await Block.find({ height: { $in: heights } });
    const blockByHeight = new Map(blocks.map((b) => [b.height, b]));

    const bitmaps = validBitmaps.map(
      (bitmap) =>
        ({
          ...bitmap.toObject(),
          block: blockByHeight.get(bitmap.genesis_height.toString()) ?? null,
        }) as IBitmapEnriched,
    );

    // Index freshness so the frontend can tell users how stale a miss can be
    const state = await BitmapState.findById("collection_state");
    return {
      bitmaps,
      last_synced_at: state ? (state.get("updatedAt") as Date) : null,
      last_synced_block_height: state ? state.block_height : null,
    };
  }
}
