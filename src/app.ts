import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config, assertProductionConfig } from "./config/env";
import { connectDB } from "./config/db";
import { routes } from "./routes";
import { errorHandler, notFound } from "./middlewares/errorHandler";
import { createServer } from "http";
import { Server } from "socket.io";
import orderSocketHandler from "./sockets/orderSocket";
import { startReconciliationJob } from "./jobs/reconciliation";

const app = express();
const httpServer = createServer(app);

const allowedOrigins =
  config.nodeEnv === "production"
    ? [config.clientUrl]
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST"],
};

// Socket.io
const io = new Server(httpServer, { cors: corsOptions });

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  orderSocketHandler(io, socket);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting on the order flow (creation, PSBT submission)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // limit each IP to 60 order-flow requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/orders", orderLimiter);

// Routes
app.use("/api", routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const startServer = async (): Promise<void> => {
  try {
    assertProductionConfig();
    await connectDB();
    startReconciliationJob();

    httpServer.listen(config.port, config.host, () => {
      console.log(`Server running on ${config.host}:${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Bitcoin network: ${config.bitcoinNetwork}`);
      console.log(
        `Platform wallet: ${config.platformWallet || "(not set)"} (fee: ${config.platformFeeSats} sats)`,
      );
      console.log(`OrdinalsBot: ${config.ordinalsBotUrl}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err: Error) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

export { app, startServer, io };
