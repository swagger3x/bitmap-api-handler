import mongoose, { Document, Schema } from "mongoose";

interface IFeeDistribution {
  "0-500": string;
  "500-2K": string;
  "2K-5K": string;
  "5K-10K": string;
  "10K-50K": string;
  "50K-200K": string;
  "200K-1M": string;
  "1M+": string;
}

interface IFeeRateDistribution {
  "0-3": string;
  "3-5": string;
  "5-10": string;
  "10-20": string;
  "20-50": string;
  "50-100": string;
  "100-500": string;
  "500+": string;
}

export interface IBlock extends Document {
  height: string;
  avg_fee_rate: number;
  block_hash: string;
  fee_distribution: IFeeDistribution;
  fee_rate_distribution: IFeeRateDistribution;
  max_fee_rate: number;
  median_fee_rate: number;
  min_fee_rate: number;
  size: string;
  timestamp: string;
  total_fees_sats: number;
  total_value_sats: number;
  tx_count: string;
  weight: string;
}

const FeeDistributionSchema = new Schema<IFeeDistribution>(
  {
    "0-500": { type: String, default: "0" },
    "500-2K": { type: String, default: "0" },
    "2K-5K": { type: String, default: "0" },
    "5K-10K": { type: String, default: "0" },
    "10K-50K": { type: String, default: "0" },
    "50K-200K": { type: String, default: "0" },
    "200K-1M": { type: String, default: "0" },
    "1M+": { type: String, default: "0" },
  },
  { _id: false },
);

const FeeRateDistributionSchema = new Schema<IFeeRateDistribution>(
  {
    "0-3": { type: String, default: "0" },
    "3-5": { type: String, default: "0" },
    "5-10": { type: String, default: "0" },
    "10-20": { type: String, default: "0" },
    "20-50": { type: String, default: "0" },
    "50-100": { type: String, default: "0" },
    "100-500": { type: String, default: "0" },
    "500+": { type: String, default: "0" },
  },
  { _id: false },
);

const BlockSchema: Schema = new Schema({
  height: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  avg_fee_rate: {
    type: Number,
    required: true,
    default: 0,
  },
  block_hash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  fee_distribution: {
    type: FeeDistributionSchema,
    required: true,
  },
  fee_rate_distribution: {
    type: FeeRateDistributionSchema,
    required: true,
  },
  max_fee_rate: {
    type: Number,
    required: true,
    default: 0,
  },
  median_fee_rate: {
    type: Number,
    required: true,
    default: 0,
  },
  min_fee_rate: {
    type: Number,
    required: true,
    default: 0,
  },
  size: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
    required: true,
  },
  total_fees_sats: {
    type: Number,
    required: true,
    default: 0,
  },
  total_value_sats: {
    type: Number,
    required: true,
    default: 0,
  },
  tx_count: {
    type: String,
    required: true,
  },
  weight: {
    type: String,
    required: true,
  },
});

BlockSchema.index({ height: 1, block_hash: 1 });

export const Block = mongoose.model<IBlock>("blocks", BlockSchema);
