import { Router } from "express";
import { bitmapRoutes } from "./bitmap";
import { webhookHandler } from "../controllers/webhookHandler";

const router = Router();

router.use("/bitmaps", bitmapRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: "connected", // You might want to add actual DB health check
  });
});

router.post("/webhook", webhookHandler);

export { router as routes };
