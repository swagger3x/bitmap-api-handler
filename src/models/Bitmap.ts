import mongoose, { Document, Schema } from "mongoose";

export interface IBitmap extends Document {
  bitmap_number: number;
  inscription_id: string;
  inscription_number: number;
  owner_wallet_addr: string;
  last_transfer_block_height: number;
  genesis_height: number;
  last_sale_price: number | null;
  content_url: string;
  bis_url: string;
  createdAt: Date;
  updatedAt: Date;
}

const BitmapSchema: Schema = new Schema(
  {
    bitmap_number: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    inscription_id: {
      type: String,
      required: true,
      index: true,
    },
    inscription_number: {
      type: Number,
      required: true,
      index: true,
    },
    owner_wallet_addr: {
      type: String,
      required: true,
      index: true,
    },
    last_transfer_block_height: {
      type: Number,
      required: true,
    },
    genesis_height: {
      type: Number,
      required: true,
    },
    last_sale_price: {
      type: Number,
      default: null,
    },
    content_url: {
      type: String,
      required: true,
    },
    bis_url: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better query performance
BitmapSchema.index({ bitmap_number: 1, inscription_number: 1 });
BitmapSchema.index({ owner_wallet_addr: 1, bitmap_number: 1 });

export const Bitmap = mongoose.model<IBitmap>("Bitmap", BitmapSchema);
