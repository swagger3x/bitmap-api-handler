import dotenv from "dotenv";

dotenv.config();

interface Config {
  port: number;
  mongoURI: string;
  bestApiUrl: string;
  nodeEnv: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || "5000"),
  mongoURI: process.env.MONGODB_URI || "mongodb://localhost:27017/bitmaps",
  bestApiUrl:
    process.env.EXTERNAL_API_URL ||
    "https://api.bestinslot.xyz/v3/collection/bitmap/inscriptions",
  nodeEnv: process.env.NODE_ENV || "development",
};
