/*
 * Local OrdinalsBot mock — stand-in while OrdinalsBot's testnet APIs are down.
 *
 * Mimics the three behaviors the backend consumes:
 *   POST /inscribe      → creates an order (charge amount only, like the real API)
 *   GET  /order?id=...  → order object with paid/underpaid/expired flags + tx once inscribed
 *   webhooks            → POSTs { id } to the backend on every "state" change
 *
 * The payment leg stays REAL: the charge address is a testnet4 address you
 * control (MOCK_CHARGE_ADDRESS), and the mock polls the real testnet4 chain
 * (mempool mirror) and only reports `paid` once the payment tx actually
 * appears. Everything after that (inscription id, reveal tx) is fabricated.
 *
 * Failure-case controls (for testing the failure paths):
 *   POST /mock/:id/expire     → order becomes expired
 *   POST /mock/:id/underpaid  → order becomes underpaid (maps to failed)
 *
 * Run: npm run mock:ob   (backend .env must set ORDINALS_BOT_URL=http://localhost:5999)
 */

require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const PORT = parseInt(process.env.MOCK_OB_PORT || "5999");
const CHARGE_ADDRESS = process.env.MOCK_CHARGE_ADDRESS || "";
const BASE_CHARGE_SATS = parseInt(process.env.MOCK_CHARGE_SATS || "15000");
const MEMPOOL_API =
  process.env.MEMPOOL_API_URL || "https://mempool.emzy.de/testnet4/api";
// The mock always webhooks the local backend directly — no tunnel needed.
const WEBHOOK_URL =
  process.env.MOCK_WEBHOOK_URL || "http://localhost:5000/api/webhook";

const CHARGE_READY_DELAY_MS = 5_000; // creation → charge address available
const INSCRIBE_DELAY_MS = 20_000; // payment seen → "inscribed"
const PAYMENT_POLL_MS = 15_000;

if (!CHARGE_ADDRESS) {
  console.error(
    "[mock] MOCK_CHARGE_ADDRESS is required (a testnet4 address you control — it receives the charge payments)",
  );
  process.exit(1);
}

const randHex = (chars) => crypto.randomBytes(chars / 2).toString("hex");

const orders = new Map(); // id -> order
const consumedTxids = new Set(); // one payment tx can satisfy only one order

const fireWebhook = async (order, note) => {
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Payload is intentionally minimal — the backend only trusts the id
      // and re-fetches the order from us anyway.
      body: JSON.stringify({ id: order.id, state: note }),
    });
    console.log(`[mock] webhook → ${order.id} (${note})`);
  } catch (err) {
    console.error(`[mock] webhook delivery failed (${note}):`, err.message);
  }
};

// Shape mirrors the real GET /order response the backend was built against.
const publicOrder = (o) => ({
  status: "ok",
  id: o.id,
  orderType: "direct",
  createdAt: o.createdAt,
  charge: o.chargeReady
    ? { address: CHARGE_ADDRESS, amount: o.amount }
    : { amount: o.amount },
  chainFee: o.amount - 2000,
  serviceFee: 2000,
  paid: o.paid,
  underpaid: o.underpaid,
  expired: o.expired,
  ...(o.tx ? { tx: o.tx } : {}),
  ...(o.sent ? { sent: o.sent } : {}),
});

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/inscribe", (req, res) => {
  const id = crypto.randomUUID();
  // Randomized amount so concurrent orders (and leftovers from earlier test
  // runs) can't be confused with each other when matching payments on-chain.
  const amount = BASE_CHARGE_SATS + Math.floor(Math.random() * 1000);
  const order = {
    id,
    amount,
    createdAt: Date.now(),
    chargeReady: false,
    paid: false,
    underpaid: false,
    expired: false,
    tx: null,
    sent: null,
    receiveAddress: req.body?.receiveAddress,
    fileSize: req.body?.files?.[0]?.size,
  };
  orders.set(id, order);
  console.log(
    `[mock] order created ${id} amount=${amount} size=${order.fileSize} receive=${order.receiveAddress}`,
  );

  setTimeout(() => {
    if (order.expired) return;
    order.chargeReady = true;
    console.log(`[mock] charge ready for ${id} → pay ${order.amount} sats to ${CHARGE_ADDRESS}`);
    fireWebhook(order, "waiting-payment");
  }, CHARGE_READY_DELAY_MS);

  res.json({
    status: "ok",
    id,
    charge: { amount },
    chainFee: amount - 2000,
    serviceFee: 2000,
    orderType: "direct",
    createdAt: order.createdAt,
  });
});

app.get("/order", (req, res) => {
  const order = orders.get(req.query.id);
  if (!order) {
    res.status(404).json({ status: "error", error: "order not found" });
    return;
  }
  res.json(publicOrder(order));
});

// ── Failure-case controls ────────────────────────────────────────────
app.post("/mock/:id/expire", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.sendStatus(404);
  order.expired = true;
  console.log(`[mock] forced expire ${order.id}`);
  fireWebhook(order, "expired");
  res.json(publicOrder(order));
});

app.post("/mock/:id/underpaid", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.sendStatus(404);
  order.underpaid = true;
  console.log(`[mock] forced underpaid ${order.id}`);
  fireWebhook(order, "payment-notenough");
  res.json(publicOrder(order));
});

app.get("/mock/orders", (req, res) => {
  res.json([...orders.values()].map(publicOrder));
});

// ── Real-chain payment watcher ───────────────────────────────────────
setInterval(async () => {
  const waiting = [...orders.values()].filter(
    (o) => o.chargeReady && !o.paid && !o.expired && !o.underpaid,
  );
  if (waiting.length === 0) return;

  try {
    const res = await fetch(`${MEMPOOL_API}/address/${CHARGE_ADDRESS}/txs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txs = await res.json();

    for (const order of waiting) {
      const match = txs.find(
        (tx) =>
          !consumedTxids.has(tx.txid) &&
          tx.vout?.some(
            (v) =>
              v.scriptpubkey_address === CHARGE_ADDRESS &&
              v.value === order.amount,
          ),
      );
      if (!match) continue;

      consumedTxids.add(match.txid);
      order.paid = true;
      order.paymentTxid = match.txid;
      console.log(`[mock] payment detected for ${order.id}: ${match.txid}`);
      fireWebhook(order, "payment-received");

      setTimeout(() => {
        if (order.expired) return;
        order.tx = {
          commit: order.paymentTxid,
          reveal: randHex(64),
          inscription: `${randHex(64)}i0`,
          fees: 546,
        };
        order.sent = randHex(64);
        console.log(`[mock] inscribed ${order.id}: ${order.tx.inscription}`);
        fireWebhook(order, "completed");
      }, INSCRIBE_DELAY_MS);
    }
  } catch (err) {
    console.error("[mock] payment poll failed:", err.message);
  }
}, PAYMENT_POLL_MS);

app.listen(PORT, () => {
  console.log(`[mock] OrdinalsBot mock listening on http://localhost:${PORT}`);
  console.log(`[mock] charge address: ${CHARGE_ADDRESS}`);
  console.log(`[mock] watching payments via: ${MEMPOOL_API}`);
  console.log(`[mock] webhooks → ${WEBHOOK_URL}`);
});
