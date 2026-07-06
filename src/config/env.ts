import dotenv from "dotenv";

dotenv.config();

export type BitcoinNetwork = "mainnet" | "testnet" | "testnet4" | "signet";

interface Config {
  port: number;
  mongoURI: string;
  bestApiUrl: string;
  bestApiKey: string;
  clientUrl: string;
  nodeEnv: string;
  ordinalsBotUrl: string;
  platformWallet: string;
  platformFeeSats: number;
  webhookUrl: string;
  bitcoinNetwork: BitcoinNetwork;
  mempoolApiUrl: string;
  paymentWindowMinutes: number;
  fallbackFeeRate: number;
}

const MEMPOOL_API_URLS: Record<BitcoinNetwork, string> = {
  mainnet: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet/api",
  testnet4: "https://mempool.space/testnet4/api",
  signet: "https://mempool.space/signet/api",
};

const bitcoinNetwork = (process.env.BITCOIN_NETWORK ||
  "mainnet") as BitcoinNetwork;

export const config: Config = {
  port: parseInt(process.env.PORT || "5000"),
  mongoURI: process.env.MONGODB_URI || "mongodb://localhost:27017/bitmaps",
  bestApiUrl:
    process.env.EXTERNAL_API_URL ||
    "https://api.bestinslot.xyz/v3/collection/bitmap/inscriptions",
  bestApiKey: process.env.BEST_API_KEY || "",
  clientUrl: process.env.CLIENT_URL || "https://ordinals-mint-app.vercel.app",
  nodeEnv: process.env.NODE_ENV || "development",
  ordinalsBotUrl: process.env.ORDINALS_BOT_URL || "https://api.ordinalsbot.com",
  platformWallet: process.env.PLATFORM_WALLET_ADDRESS || "",
  platformFeeSats: parseInt(process.env.PLATFORM_FEE_SATS || "12024"),
  // Public URL OrdinalsBot POSTs order status changes to,
  // e.g. https://api.example.com/api/webhook (ngrok tunnel in development)
  webhookUrl: process.env.WEBHOOK_URL || "",
  bitcoinNetwork,
  mempoolApiUrl:
    process.env.MEMPOOL_API_URL ||
    MEMPOOL_API_URLS[bitcoinNetwork] ||
    MEMPOOL_API_URLS.mainnet,
  paymentWindowMinutes: parseInt(process.env.PAYMENT_WINDOW_MINUTES || "60"),
  fallbackFeeRate: parseInt(process.env.FALLBACK_FEE_RATE || "15"),
};

// Called at startup: refuse to boot in production with a config that would
// silently skip fee collection or never receive webhooks.
export const assertProductionConfig = (): void => {
  if (config.nodeEnv !== "production") return;
  const missing: string[] = [];
  if (!config.platformWallet) missing.push("PLATFORM_WALLET_ADDRESS");
  if (!config.webhookUrl) missing.push("WEBHOOK_URL");
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars in production: ${missing.join(", ")}`,
    );
  }
};
