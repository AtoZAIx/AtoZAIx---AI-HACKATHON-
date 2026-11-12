import "server-only";
import { parsePayPalValue, toPayPalValue } from "../money";
import {
  PaymentError,
  type CreateOrderInput,
  type ExpectedPayee,
  type PaymentGateway,
  type PaymentView,
  type WebhookEvent,
  type WebhookVerification,
} from "./gateway";

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as unknown as { __paypalToken?: { value: string; expiresAt: number } };

function apiBase(): string {
  return process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
}

async function accessToken(): Promise<string> {
  const cached = g.__paypalToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const id = process.env.PAYPAL_CLIENT_ID!;
  const secret = process.env.PAYPAL_CLIENT_SECRET!;
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PaymentError(`PayPal auth failed (${res.status})`, 502, await safeJson(res));
  const json = (await res.json()) as { access_token: string; expires_in: number };
  g.__paypalToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function call<T>(path: string, init: RequestInit & { requestId?: string } = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await safeJson(res)) as any;
    const issue = body?.details?.[0]?.issue ?? body?.name ?? res.statusText;
    throw new PaymentError(`PayPal ${path} failed: ${issue}`, res.status === 422 ? 422 : 502, body);
  }
  return (await res.json()) as T;
}

function payeeOf(unit: any): ExpectedPayee | null {
  const p = unit?.payee;
  if (!p) return null;
  return { merchantId: p.merchant_id ?? undefined, email: p.email_address ?? undefined };
}

export function normalizeOrder(json: any): PaymentView {
  const unit = json?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    paypalOrderId: json.id,
    orderStatus: json.status,
    captureId: capture?.id ?? null,
    captureStatus: capture?.status ?? null,
    captureStatusReason: capture?.status_details?.reason ?? null,
    amountCents: capture?.amount?.value ? parsePayPalValue(capture.amount.value) : null,
    currency: capture?.amount?.currency_code ?? null,
    customId: capture?.custom_id ?? unit?.custom_id ?? null,
    invoiceId: capture?.invoice_id ?? unit?.invoice_id ?? null,
    referenceId: unit?.reference_id ?? null,
    payee: payeeOf(unit),
    payerEmail: json?.payer?.email_address ?? null,
  };
}

export function buildOrderBody(input: CreateOrderInput) {
  const { order } = input;
  const product = order.lineItems.find((l) => l.kind === "product")!;
  const included = order.lineItems.filter((l) => l.kind !== "product").map((l) => l.name.replace(" (included)", ""));
  const description = `${input.productName} from ${input.merchantName} via AtoZAIx${included.length ? ` · incl. ${included.join(", ")}` : ""}`.slice(0, 127);
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: order.id,
        custom_id: order.id,
        invoice_id: `ATOZAIX-${order.id}`,
        description,
        soft_descriptor: "NEXUS",
        amount: {
          currency_code: order.currency,
          value: toPayPalValue(order.totalCents),
          breakdown: {
            item_total: { currency_code: order.currency, value: toPayPalValue(order.subtotalCents) },
            shipping: { currency_code: order.currency, value: toPayPalValue(order.shippingCents) },
          },
        },
        items: [
          {
            name: product.name.slice(0, 127),
            sku: product.sku,
            quantity: String(product.quantity),
            unit_amount: { currency_code: order.currency, value: toPayPalValue(product.unitPriceCents) },
            category: "PHYSICAL_GOODS",
          },
        ],
        ...(input.payee
          ? { payee: input.payee.merchantId ? { merchant_id: input.payee.merchantId } : { email_address: input.payee.email } }
          : {}),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "AtoZAIx",
          user_action: "PAY_NOW",
          // A booking token (property, rental, car) ships nothing.
          shipping_preference: input.order.booking ? "NO_SHIPPING" : "GET_FROM_FILE",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  };
}

export const paypalGateway: PaymentGateway = {
  provider: "paypal-sandbox",
  get clientId() {
    return process.env.PAYPAL_CLIENT_ID ?? null;
  },

  async createOrder(input) {
    const json = await call<any>("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify(buildOrderBody(input)),
      requestId: `create-${input.order.id}-${input.order.payment ? "retry" : "first"}-${Date.now()}`,
    });
    return { id: json.id, status: json.status, payee: payeeOf(json.purchase_units?.[0]) };
  },

  async captureOrder(paypalOrderId, requestId) {
    const json = await call<any>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      body: "{}",
      requestId,
    });
    return normalizeOrder(json);
  },

  async getOrder(paypalOrderId) {
    return normalizeOrder(await call<any>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { method: "GET" }));
  },

  async verifyWebhook(headers, rawBody): Promise<WebhookVerification> {
    let event: WebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { verified: false, event: null, reason: "Body is not JSON" };
    }
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return { verified: false, event, reason: "PAYPAL_WEBHOOK_ID not configured" };
    const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
    if (required.some((h) => !headers.get(h))) return { verified: false, event, reason: "Missing PayPal signature headers" };
    try {
      const res = await call<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      });
      const ok = res.verification_status === "SUCCESS";
      return { verified: ok, event, reason: ok ? "PayPal verify-webhook-signature: SUCCESS" : `PayPal returned ${res.verification_status}` };
    } catch (err) {
      return { verified: false, event, reason: err instanceof Error ? err.message : "Verification call failed" };
    }
  },
};
