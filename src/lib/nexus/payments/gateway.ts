import type { NexusOrder, PaymentProvider } from "../types";

export interface ExpectedPayee {
  merchantId?: string;
  email?: string;
}

export interface CreateOrderInput {
  order: NexusOrder;
  merchantName: string;
  productName: string;
  /** Configured payee for this merchant, if any. */
  payee: ExpectedPayee | null;
  returnUrl: string;
  cancelUrl: string;
}

/** Normalised, provider-agnostic view of a PayPal order and its capture. */
export interface PaymentView {
  paypalOrderId: string;
  orderStatus: string;
  captureId: string | null;
  captureStatus: string | null;
  /** Why a PENDING capture is on hold (PayPal's status_details.reason), e.g. PENDING_REVIEW. */
  captureStatusReason?: string | null;
  amountCents: number | null;
  currency: string | null;
  customId: string | null;
  invoiceId: string | null;
  referenceId: string | null;
  payee: ExpectedPayee | null;
  payerEmail: string | null;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  create_time?: string;
  resource_type?: string;
  resource: {
    id?: string;
    status?: string;
    amount?: { currency_code: string; value: string };
    custom_id?: string;
    invoice_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    links?: Array<{ href: string; rel: string }>;
    disputed_transactions?: Array<{ seller_transaction_id?: string }>;
    dispute_id?: string;
  };
}

export interface WebhookVerification {
  verified: boolean;
  event: WebhookEvent | null;
  reason: string;
}

export interface PaymentGateway {
  provider: PaymentProvider;
  /** Public client id for the browser SDK (null in simulator mode). */
  clientId: string | null;
  createOrder(input: CreateOrderInput): Promise<{ id: string; status: string; payee: ExpectedPayee | null }>;
  captureOrder(paypalOrderId: string, requestId: string): Promise<PaymentView>;
  getOrder(paypalOrderId: string): Promise<PaymentView>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<WebhookVerification>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
