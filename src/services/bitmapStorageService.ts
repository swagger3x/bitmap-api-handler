import { Model, MongooseError } from "mongoose";
import { Bitmap, IBitmap } from "../models/Bitmap";
import { BitmapState, IBitmapState } from "../models/State";
import { DatabaseError, NotFoundError } from "../utils/errors";

export class BitmapStorage {
  private BitmapModel: Model<IBitmap>;
  private StateModel: Model<IBitmapState>;

  constructor() {
    this.BitmapModel = Bitmap; // Use your imported model
    this.StateModel = BitmapState;
  }

  // Store bitmap data in MongoDB
  async storeBitmapData(data: IBitmap[] | null): Promise<boolean> {
    if (!data || !Array.isArray(data)) {
      throw new Error("No valid data to store");
    }

    try {
      // Simply insert all documents at once without any checks
      const result = await this.BitmapModel.insertMany(data, {
        ordered: false,
      });

      console.log(
        `Inserted ${result.length} documents without duplicate checking`
      );
      return true;
    } catch (error) {
      if (error instanceof MongooseError) {
        // Even with ordered: false, we might get some errors but others will succeed
        console.log(
          `Partial success. Some documents were inserted: ${error.message}`
        );
        return true; // Still return true as some data was processed
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  async storeBitmapDataIndividual(data: IBitmap[] | null): Promise<boolean> {
    if (!data || !Array.isArray(data)) {
      console.log("No valid data to store");
      return false;
    }

    try {
      let successCount = 0;

      for (const item of data) {
        try {
          // Find existing document by either inscription_id or bitmap_number
          const existingDoc = await this.BitmapModel.findOne({
            $or: [
              { inscription_id: item.inscription_id },
              { bitmap_number: item.bitmap_number },
            ],
          });

          if (existingDoc) {
            // Update existing document
            await this.BitmapModel.findByIdAndUpdate(existingDoc._id, item);
            successCount++;
          } else {
            // Create new document
            await this.BitmapModel.create(item);
            successCount++;
          }
        } catch (itemError) {
          console.error(
            `Error processing item ${item.inscription_id}:`,
            itemError
          );
        }
      }

      console.log(
        `Successfully processed ${successCount} out of ${data.length} documents`
      );
      return successCount > 0;
    } catch (error) {
      if (error instanceof MongooseError) {
        throw new DatabaseError(`Database operation failed: ${error.message}`);
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  async updateState(offset: number, block_height: number): Promise<boolean> {
    try {
      const stateData = {
        _id: "collection_state",
        last_offset: offset,
        block_height: block_height,
        total_processed: offset,
      };

      const result = await this.StateModel.findOneAndUpdate(
        { _id: "collection_state" },
        stateData,
        { upsert: true, new: true, runValidators: true }
      );

      console.log(
        `Updated state document with offset ${offset}, block height ${block_height}`
      );
      return true;
    } catch (error) {
      if (error instanceof MongooseError) {
        throw new DatabaseError(`Database operation failed: ${error.message}`);
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  public async getLastState(): Promise<{
    offset: number;
    block_height: number;
  }> {
    try {
      const state = await this.StateModel.findById("collection_state");
      if (state) {
        return {
          offset: state.last_offset,
          block_height: state.block_height,
        };
      }
      return { offset: 0, block_height: 0 };
    } catch (error) {
      if (error instanceof MongooseError) {
        throw new DatabaseError(`Database operation failed: ${error.message}`);
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  async getBitmapByNumber(bitmap_number: number): Promise<IBitmap> {
    try {
      const bitmap = await this.BitmapModel.findOne({ bitmap_number });
      if (!bitmap) {
        throw new NotFoundError("Bitmap not found");
      }
      return bitmap;
    } catch (error) {
      if (error instanceof MongooseError) {
        throw new DatabaseError(`Database operation failed: ${error.message}`);
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  async getBitmapByID(inscription_id: string): Promise<IBitmap | null> {
    try {
      const bitmap = await this.BitmapModel.findOne({ inscription_id });
      // if (!bitmap) {
      //   throw new NotFoundError("Bitmap not found");
      // }
      return bitmap;
    } catch (error) {
      if (error instanceof MongooseError) {
        throw new DatabaseError(`Database operation failed: ${error.message}`);
      }
      throw new DatabaseError(`Unexpected database error: ${error}`);
    }
  }

  async getBitmapsByRange(start: number, end: number): Promise<IBitmap[]> {
    try {
      return await this.BitmapModel.find({
        bitmap_number: { $gte: start, $lte: end },
      }).sort({ bitmap_number: 1 });
    } catch (error) {
      throw new DatabaseError(`Failed to fetch bitmaps by range: ${error}`);
    }
  }

  async getTotalBitmapsCount(): Promise<number> {
    try {
      return await this.BitmapModel.countDocuments();
    } catch (error) {
      throw new DatabaseError(`Failed to get bitmap count: ${error}`);
    }
  }
}
