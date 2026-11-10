import "server-only";
import type { MerchantId } from "../types";
import type { ExpectedPayee, PaymentGateway } from "./gateway";
import { paypalGateway } from "./paypal";
import { simulatedGateway } from "./simulated";

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.NEXUS_PAYMENTS !== "simulated";
}

export function getGateway(): PaymentGateway {
  return paypalConfigured() ? paypalGateway : simulatedGateway;
}

/**
 * Optional per-merchant sandbox payees, e.g. PAYPAL_PAYEE_EMAIL_BOLT.
 * When unset, PayPal assigns the API caller as payee and Nexus pins
 * whatever payee PayPal reports at order creation.
 */
export function configuredPayee(merchantId: MerchantId): ExpectedPayee | null {
  const key = merchantId.toUpperCase();
  const merchantIdEnv = process.env[`PAYPAL_PAYEE_MERCHANT_ID_${key}`];
  const emailEnv = process.env[`PAYPAL_PAYEE_EMAIL_${key}`];
  if (merchantIdEnv) return { merchantId: merchantIdEnv };
  if (emailEnv) return { email: emailEnv };
  return null;
}

/** Whether a verified webhook is required before an order is confirmed. */
export function webhookRequired(): boolean {
  const flag = process.env.NEXUS_REQUIRE_WEBHOOK;
  if (flag === "true") return true;
  if (flag === "false") return false;
  // The simulator always delivers its webhook; real sandbox webhooks need a
  // public URL, so they're opt-in there.
  return !paypalConfigured();
}

export { simulatedGateway };
export type { PaymentGateway };
