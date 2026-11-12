/**
 * What happened with a payment, in plain words: success, pending or failure
 * (plus refunded and disputed afterwards), worked out from the order's own
 * server-side state. Shared by the server and the result screen.
 */
import { RESULT_PLAIN } from "./payments/test-cards";
import type { NexusOrder } from "./types";

export type OutcomeKind = "success" | "pending" | "failure" | "refunded" | "disputed";

export interface PaymentOutcome {
  kind: OutcomeKind;
  title: string;
  message: string;
  /** Why, when known (a decline reason, what PayPal is waiting for…). */
  reason: string | null;
  /**
   * How to try again: "checkout" = the PayPal buttons are still open below;
   * "new-payment" = start a fresh payment for the same approved deal;
   * null = can't be retried (a safety check failed, or nothing to retry).
   */
  retry: "checkout" | "new-payment" | null;
  /** Whether money may have left the customer's account. */
  charged: boolean;
}

/** PayPal error and decline codes, in plain words. */
export const PAYPAL_ERRORS: Record<string, string> = {
  INSTRUMENT_DECLINED: "Your bank or card declined the payment. Try another card or your PayPal balance.",
  PAYER_ACTION_REQUIRED: "PayPal needs one more step from you. Open PayPal again to finish.",
  TRANSACTION_REFUSED: "PayPal refused this payment. Try another way to pay.",
  PAYER_CANNOT_PAY: "This PayPal account can’t make this payment. Try another account or card.",
  CARD_EXPIRED: "The card has expired. Choose another card in PayPal.",
  MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED: "Too many attempts on this payment. Wait a few minutes, then start a new payment.",
  PAYEE_ACCOUNT_RESTRICTED: "The store can’t receive payments right now. You weren’t charged.",
  COMPLIANCE_VIOLATION: "PayPal stopped this payment for compliance reasons. You weren’t charged.",
  ORDER_NOT_APPROVED: "The payment wasn’t approved on PayPal yet. Open PayPal to approve it.",
  DUPLICATE_INVOICE_ID: "This payment was already made, so it wasn’t charged twice.",
  DENIED: "PayPal declined the payment after reviewing it. If money was held, PayPal releases it.",
};

/** Why PayPal is holding a payment (capture status_details.reason), in plain words. */
export const PENDING_REASONS: Record<string, string> = {
  PENDING_REVIEW: "PayPal is reviewing this payment. This usually takes a few minutes, sometimes up to 24 hours.",
  ECHECK: "You paid by eCheck, which takes a few days to clear.",
  VERIFICATION_REQUIRED: "PayPal needs to verify the payment before it completes.",
  RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION: "The store has to accept this payment in PayPal first.",
  UNILATERAL: "The store’s PayPal account isn’t fully set up yet.",
  OTHER: "PayPal is still processing this payment.",
};

/** A PayPal error like "PayPal /v2/... failed: INSTRUMENT_DECLINED" → its code. */
export function paypalCode(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = /\b([A-Z][A-Z0-9_]{5,})\b/.exec(message);
  return m && (PAYPAL_ERRORS[m[1]] || /_/.test(m[1])) ? m[1] : null;
}

export const plainPaymentError = (message: string | null | undefined): string => {
  const code = paypalCode(message);
  return (code && PAYPAL_ERRORS[code]) || "The payment didn’t go through. You weren’t charged.";
};

export function paymentOutcome(order: NexusOrder): PaymentOutcome | null {
  const p = order.payment;
  const last = p?.lifecycle.at(-1);
  const booking = Boolean(order.booking);

  switch (order.status) {
    case "confirmed":
      return {
        kind: "success",
        title: booking ? "Booking confirmed" : "Payment successful",
        message: booking ? "Your refundable booking token is paid and the deal is held for you." : "Your order is paid and confirmed.",
        reason: null,
        retry: null,
        charged: true,
      };
    case "payment_captured":
      return p?.status === "PENDING"
        ? {
            kind: "pending",
            title: "Payment on hold",
            message: "PayPal has your payment but is holding it before it completes.",
            reason: PENDING_REASONS[p.pendingReason ?? "OTHER"] ?? PENDING_REASONS.OTHER,
            retry: null,
            charged: true,
          }
        : {
            kind: "pending",
            title: "Confirming your payment",
            message: "PayPal took the payment. We’re waiting for PayPal’s signed confirmation before we confirm the order.",
            reason: null,
            retry: null,
            charged: true,
          };
    case "payment_pending": {
      if (!p) return null;
      if (last?.state === "capturing") return { kind: "pending", title: "Processing your payment", message: "Talking to PayPal now. Don’t close this page.", reason: null, retry: null, charged: false };
      if (last?.state === "failed") {
        return { kind: "failure", title: "Payment didn’t go through", message: "You can try again below with another card or your PayPal balance.", reason: plainPaymentError(p.lastError?.code ?? last.detail), retry: "checkout", charged: false };
      }
      const card = p.cardAttempts?.at(-1);
      if (card && !card.approved && p.status === "CREATED") {
        return { kind: "failure", title: "Card declined", message: "Check the card details, or try another card below.", reason: RESULT_PLAIN[card.result] ?? card.respmsg, retry: "checkout", charged: false };
      }
      return null;
    }
    case "payment_failed": {
      // A decline can be retried; a safety check that didn't match (wrong amount or payee) can't.
      const declined = p?.status === "DECLINED" || p?.status === "FAILED";
      const failedChecks = (p?.verification?.checks ?? []).filter((c) => c.essential && c.status === "fail" && c.id !== "order-status" && c.id !== "capture-status");
      if (declined && failedChecks.length === 0) {
        return {
          kind: "failure",
          title: "Payment declined",
          message: p?.captureId ? "PayPal declined the payment after reviewing it. Any money it held is released back to you." : "PayPal declined the payment.",
          reason: plainPaymentError(p?.lastError?.code ?? "DENIED"),
          retry: "new-payment",
          charged: false,
        };
      }
      return {
        kind: "failure",
        title: "We stopped this order",
        message: "Something PayPal reported didn’t match what you approved, so we didn’t confirm the order. Any money taken is returned by PayPal.",
        reason: failedChecks.map((c) => c.label).join(", ") || null,
        retry: null,
        charged: Boolean(p?.captureId),
      };
    }
    case "refunded":
      return { kind: "refunded", title: "Payment refunded", message: "PayPal returned this payment to you.", reason: null, retry: null, charged: false };
    case "disputed":
      return { kind: "disputed", title: "Dispute open", message: "A dispute is open with PayPal for this payment. PayPal will contact you.", reason: null, retry: null, charged: true };
    default:
      return null;
  }
}
