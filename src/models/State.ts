import mongoose, { Document, Schema } from "mongoose";

export interface IBitmapState extends Document {
  _id: string;
  block_height: number;
  last_offset: number;
  total_processed: number;
}

const BitmapStateSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    block_height: {
      type: Number,
      required: true,
    },
    last_offset: {
      type: Number,
      required: true,
    },
    total_processed: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const BitmapState = mongoose.model<IBitmapState>(
  "states",
  BitmapStateSchema
);
