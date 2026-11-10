import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { toPayPalValue } from "../money";
import {
  PaymentError,
  type CreateOrderInput,
  type ExpectedPayee,
  type PaymentGateway,
  type PaymentView,
  type WebhookEvent,
  type WebhookVerification,
} from "./gateway";

/**
 * Local stand-in for PayPal Orders v2, used when no sandbox credentials are
 * configured. It enforces the same lifecycle (CREATED → APPROVED →
 * COMPLETED), returns the same shapes and signs its webhooks, so every
 * verification path in Nexus runs unchanged. It never moves money.
 */

interface SimOrder {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED";
  amountCents: number;
  currency: string;
  customId: string;
  invoiceId: string;
  referenceId: string;
  payee: ExpectedPayee;
  captureId: string | null;
  captureRequests: Map<string, PaymentView>;
  /** Test hook: capture this amount instead of the order amount. */
  tamperCaptureCents?: number;
}

const g = globalThis as unknown as { __simOrders?: Map<string, SimOrder>; __simWebhookSecret?: string };
const orders = () => (g.__simOrders ??= new Map());

function webhookSecret(): string {
  return process.env.NEXUS_SIM_WEBHOOK_SECRET || (g.__simWebhookSecret ??= randomBytes(32).toString("hex"));
}

function paypalStyleId(prefix = ""): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPRSTUVWXY";
  const bytes = randomBytes(17);
  return prefix + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").slice(0, 17 - prefix.length);
}

function view(o: SimOrder): PaymentView {
  const captured = o.status === "COMPLETED";
  return {
    paypalOrderId: o.id,
    orderStatus: o.status,
    captureId: o.captureId,
    captureStatus: captured ? "COMPLETED" : null,
    amountCents: captured ? (o.tamperCaptureCents ?? o.amountCents) : null,
    currency: captured ? o.currency : null,
    customId: o.customId,
    invoiceId: o.invoiceId,
    referenceId: o.referenceId,
    payee: o.payee,
    payerEmail: o.status === "CREATED" ? null : "sandbox-buyer@nexus.test",
  };
}

function sign(transmissionId: string, time: string, body: string): string {
  return createHmac("sha256", webhookSecret()).update(`${transmissionId}|${time}|${body}`).digest("hex");
}

export const simulatedGateway: PaymentGateway & {
  approve(paypalOrderId: string): Promise<PaymentView>;
  buildWebhook(v: PaymentView, eventType?: string): { headers: Headers; body: string };
  /** Fresh signed headers (new transmission) for a body, as a PayPal re-delivery would carry. */
  signHeaders(body: string, time?: string): Headers;
  tamper(paypalOrderId: string, captureCents: number): void;
} = {
  provider: "simulated",
  clientId: null,

  async createOrder(input: CreateOrderInput) {
    const id = paypalStyleId("SIM");
    const payee = input.payee ?? { merchantId: `NEXUSSIM${input.order.merchantId.toUpperCase()}` };
    orders().set(id, {
      id,
      status: "CREATED",
      amountCents: input.order.totalCents,
      currency: input.order.currency,
      customId: input.order.id,
      invoiceId: `NEXUS-${input.order.id}`,
      referenceId: input.order.id,
      payee,
      captureId: null,
      captureRequests: new Map(),
    });
    // Mirror PayPal's own amount formatting validation.
    toPayPalValue(input.order.totalCents);
    return { id, status: "CREATED", payee };
  },

  async approve(paypalOrderId) {
    const o = orders().get(paypalOrderId);
    if (!o) throw new PaymentError("RESOURCE_NOT_FOUND", 404);
    if (o.status === "CREATED") o.status = "APPROVED";
    return view(o);
  },

  async captureOrder(paypalOrderId, requestId) {
    const o = orders().get(paypalOrderId);
    if (!o) throw new PaymentError("RESOURCE_NOT_FOUND", 404);
    const replay = o.captureRequests.get(requestId);
    if (replay) return replay; // PayPal-Request-Id idempotency
    if (o.status === "CREATED") throw new PaymentError("ORDER_NOT_APPROVED", 422);
    if (o.status === "COMPLETED") throw new PaymentError("ORDER_ALREADY_CAPTURED", 422);
    o.status = "COMPLETED";
    o.captureId = paypalStyleId("CAP");
    const v = view(o);
    o.captureRequests.set(requestId, v);
    return v;
  },

  async getOrder(paypalOrderId) {
    const o = orders().get(paypalOrderId);
    if (!o) throw new PaymentError("RESOURCE_NOT_FOUND", 404);
    return view(o);
  },

  buildWebhook(v, eventType = "PAYMENT.CAPTURE.COMPLETED") {
    const event: WebhookEvent = {
      id: `WH-SIM-${paypalStyleId()}`,
      event_type: eventType,
      create_time: new Date().toISOString(),
      resource_type: "capture",
      resource: {
        id: v.captureId ?? undefined,
        status: v.captureStatus ?? undefined,
        amount: v.amountCents !== null ? { currency_code: v.currency ?? "USD", value: toPayPalValue(v.amountCents) } : undefined,
        custom_id: v.customId ?? undefined,
        invoice_id: v.invoiceId ?? undefined,
        supplementary_data: { related_ids: { order_id: v.paypalOrderId } },
      },
    };
    const body = JSON.stringify(event);
    return { headers: this.signHeaders(body), body };
  },

  signHeaders(body, time = new Date().toISOString()) {
    const transmissionId = crypto.randomUUID();
    return new Headers({
      "paypal-transmission-id": transmissionId,
      "paypal-transmission-time": time,
      "paypal-transmission-sig": sign(transmissionId, time, body),
      "paypal-auth-algo": "HMAC-SHA256-NEXUS-SIM",
      "paypal-cert-url": "nexus-simulator",
    });
  },

  tamper(paypalOrderId, captureCents) {
    const o = orders().get(paypalOrderId);
    if (o) o.tamperCaptureCents = captureCents;
  },

  async verifyWebhook(headers, rawBody): Promise<WebhookVerification> {
    let event: WebhookEvent | null = null;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { verified: false, event: null, reason: "Body is not JSON" };
    }
    const id = headers.get("paypal-transmission-id");
    const time = headers.get("paypal-transmission-time");
    const sig = headers.get("paypal-transmission-sig");
    if (!id || !time || !sig) return { verified: false, event, reason: "Missing signature headers" };
    const expected = Buffer.from(sign(id, time, rawBody), "hex");
    const given = Buffer.from(sig, "hex");
    const ok = expected.length === given.length && timingSafeEqual(expected, given);
    return { verified: ok, event, reason: ok ? "Simulator HMAC signature valid" : "Signature mismatch" };
  },
};
