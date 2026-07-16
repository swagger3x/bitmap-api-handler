import { config } from "../config/env";
import { ExternalApiError } from "../utils/errors";

// Shape of the OrdinalsBot order object (subset we consume).
//
// GET /order does NOT return a lifecycle `state` string — it reports boolean
// flags (`paid`, `underpaid`, `expired`), plus `tx` (inscription data, present
// once inscribed) and `sent` (txid once delivered). The `state` strings like
// "waiting-payment" only appear in webhook payloads. orderService derives our
// internal state from whichever signals are present.
export interface OrdinalsBotOrder {
  id: string;
  status?: string; // API envelope: 'ok' | 'error'
  state?: string; // lifecycle string, e.g. "waiting-payment", "mempool", "completed"
  completed?: boolean; // top-level completion flag (mainnet GET /order)
  paid?: boolean; // payment received
  underpaid?: boolean; // payment received but insufficient
  expired?: boolean; // payment window elapsed without payment
  sent?: string; // legacy: txid once delivered
  tx?: {
    commit?: string;
    reveal?: string;
    inscription?: string;
    fees?: number;
  };
  // Mainnet GET /order carries inscription data per file (verified against
  // the live API): files[0].tx.inscription / files[0].inscriptionId
  files?: {
    inscriptionId?: string;
    inscription_id?: string;
    sent?: string;
    status?: string;
    tx?: {
      inscription?: string;
      reveal?: string;
      totalFees?: number;
    };
  }[];
  charge?: {
    // address appears with a delay after order creation — poll GET /order
    address?: string;
    amount?: number;
  };
  [key: string]: unknown;
}

export interface CreateInscriptionParams {
  dataURL: string;
  size: number;
  receiveAddress: string;
  feeRate: number;
}

const METADATA = JSON.stringify({ inscribed_by: "OrdinalsBot" });

export class OrdinalsBotService {
  // All payload construction lives server-side: the frontend only supplies
  // the content and receive address, never the webhook URL or fee params.
  static async createInscriptionOrder(
    params: CreateInscriptionParams,
  ): Promise<OrdinalsBotOrder> {
    const payload: Record<string, unknown> = {
      files: [
        {
          name: "dyson.html",
          type: "text/html",
          size: params.size,
          dataURL: params.dataURL,
          metadataDataURL: `data:application/json;base64,${Buffer.from(METADATA).toString("base64")}`,
          metadataSize: METADATA.length,
        },
      ],
      postage: 546,
      receiveAddress: params.receiveAddress,
      fee: String(params.feeRate),
    };

    // OrdinalsBot rejects non-public webhook URLs with 422 — omit rather than fail.
    if (config.webhookUrl && !/^https?:\/\/(localhost|127\.)/.test(config.webhookUrl)) {
      payload.webhookUrl = config.webhookUrl;
    }

    const res = await fetch(`${config.ordinalsBotUrl}/inscribe`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ExternalApiError(
        `OrdinalsBot order creation failed: HTTP ${res.status} ${text}`,
      );
    }

    const order = (await res.json()) as OrdinalsBotOrder;
    // OrdinalsBot can return HTTP 200 with an error envelope
    if ((order.status && order.status !== "ok") || !order.id) {
      throw new ExternalApiError(
        `OrdinalsBot order creation returned error: ${JSON.stringify(order)}`,
      );
    }
    return order;
  }

  static async getOrder(id: string): Promise<OrdinalsBotOrder> {
    const res = await fetch(
      `${config.ordinalsBotUrl}/order?id=${encodeURIComponent(id)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new ExternalApiError(
        `OrdinalsBot order fetch failed: HTTP ${res.status} ${text}`,
      );
    }

    const order = (await res.json()) as OrdinalsBotOrder;
    if (order.status && order.status !== "ok") {
      throw new ExternalApiError(
        `OrdinalsBot order fetch returned error: ${JSON.stringify(order)}`,
      );
    }
    return order;
  }
}
