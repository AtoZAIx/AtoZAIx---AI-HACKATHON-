import { findProduct } from "./catalog";
import { MERCHANT_DIRECTORY } from "./directory";
import { formatMoney } from "./money";
import { RESULT_PLAIN } from "./payments/test-cards";
import type { NexusOrder, TimelineEntry, VerificationCheck } from "./types";

export interface FriendlyEvent {
  title: string;
  detail: string;
  /** Key moments are shown by default; the rest appear under "Show all steps". */
  milestone: boolean;
  tone: "done" | "info" | "error";
  /** The original, technical record (kept for audit and the details view). */
  technical: string;
}

/**
 * Turns the backend's technical order log into plain words. Keyed on the
 * fixed labels the service writes, so existing orders read well too.
 */
export function friendlyEvent(e: TimelineEntry, order: Pick<NexusOrder, "merchantId" | "terms" | "totalCents" | "payment" | "approval">): FriendlyEvent {
  const store = MERCHANT_DIRECTORY[order.merchantId]?.name ?? "The store";
  const product = findProduct(order.terms.productId)?.name ?? "your item";
  const total = formatMoney(order.totalCents);
  const demo = order.payment?.provider === "simulated";
  const technical = `${e.label}: ${e.detail}`;
  const make = (title: string, detail: string, milestone: boolean, tone: FriendlyEvent["tone"] = e.status): FriendlyEvent => ({ title, detail, milestone, tone, technical });

  switch (e.label) {
    case "Deal agreed":
      return make("You chose a deal", `${store} agreed to sell you the ${product} for ${total}.`, true);
    case "Deal verified":
      return make("Safety checks passed", "We checked the product, price, stock, delivery, warranty, returns and your budget.", true);
    case "Order prepared":
      return make("Ready for your approval", `Waiting for you to approve ${total}.`, false);
    case "Order cancelled":
      return make("Order replaced", "You asked for new prices, so this order was cancelled. Nothing was charged.", true);
    case "Customer approved":
      return make("You approved the price", `You agreed to pay ${formatMoney(order.approval?.amountCents ?? order.totalCents)}.`, true);
    case "PayPal order created":
      return make("Payment started", `Opened PayPal checkout for ${total}.`, false);
    case "Buyer approved on PayPal":
      return make("You confirmed on PayPal", demo ? "Demo mode: no real money moved." : "You confirmed the payment in PayPal.", false);
    case "Capture failed":
      return make("Payment didn’t go through", "PayPal couldn’t collect the payment. You were not charged.", true, "error");
    case "Payment captured":
      return make("Payment received", `PayPal collected ${formatMoney(order.payment?.capturedAmountCents ?? order.totalCents)}${demo ? " (demo, no real money)" : ""}.`, true);
    case "Awaiting webhook":
      return make("Waiting for PayPal to confirm", "PayPal sends a signed message to confirm every payment. We wait for it before finishing.", false);
    case "Webhook verified":
      if (/REFUNDED/.test(e.detail)) return make("PayPal confirmed the refund", "The refund message from PayPal was checked and is genuine.", false);
      if (/DISPUTE/.test(e.detail)) return make("PayPal reported a dispute", "The dispute message from PayPal was checked and is genuine.", false);
      return make("PayPal confirmed the payment", "PayPal’s confirmation message was checked and is genuine.", false);
    case "Card approved": {
      const who = /^(.*?) · RESULT/.exec(e.detail)?.[1] ?? "Your card";
      const newLast4 = /ACCT=…(\d{4})/.exec(e.detail)?.[1];
      const newExpiry = /EXPDATE=(\d{4})/.exec(e.detail)?.[1];
      const updated = /CCUPDATED=Y/.test(e.detail)
        ? ` The card provider refreshed the details${newLast4 ? ` (now ending ${newLast4})` : ""}${newExpiry ? `${newLast4 ? "," : ""} with a new expiry date` : ""}.`
        : "";
      return make("Card approved", `${who} was approved${demo ? " (test card, no real money)" : ""}.${updated}`, true);
    }
    case "Card declined": {
      const code = Number(/RESULT (\d+)/.exec(e.detail)?.[1] ?? 12);
      const who = /^(.*?) · RESULT/.exec(e.detail)?.[1] ?? "The card";
      return make("Card declined", `${who}: ${RESULT_PLAIN[code] ?? "The payment was declined."} You can try another card or pay with PayPal.`, true, "error");
    }
    case "Fraud check passed":
      return make("Fraud check passed", "We checked this payment for signs of fraud and it looks normal.", false);
    case "Payment needs confirmation":
      return make("Please confirm it’s you", "Something about this payment looked unusual, so we asked you to confirm before paying.", true, "info");
    case "Payment confirmed by shopper":
      return make("You confirmed the payment", "Thanks. You confirmed this payment is yours, so it can go ahead.", true);
    case "Payment blocked":
      return make("Payment blocked for your safety", "Our fraud check found strong warning signs, so the payment was stopped. You were not charged.", true, "error");
    case "Webhook rejected":
      return make("Blocked a fake PayPal message", "A message pretending to be from PayPal failed our security check and was ignored. Your order is not affected.", true, "info");
    case "Order confirmed":
      return make("Order confirmed", "Everything checked out. Your order is paid and confirmed.", true);
    case "Payment verification failed":
      return make("Payment problem", "What PayPal reported didn’t match what you approved, so we didn’t confirm the order.", true, "error");
    case "Payment refunded":
      return make("Refunded", "Your payment was refunded.", true, "info");
    case "Dispute opened":
      return make("Dispute opened", "A dispute was opened with PayPal for this payment.", true, "error");
    default:
      return make(e.label, e.detail, true);
  }
}

/** One-line, plain explanations of each safety check, shown above the technical detail. */
const CHECK_TEXT: Record<string, string> = {
  // Deal checks
  product: "It’s the exact product you asked for.",
  specs: "It meets everything you said you must have.",
  merchant: "The store is a registered Nexus store.",
  payee: "We know which PayPal account the money goes to.",
  total: "The total adds up correctly, in US dollars.",
  "list-price": "The “original price” we compared against is the store’s real price.",
  stock: "The store has it in stock.",
  delivery: "The delivery promise is one the store really offers.",
  "delivery-need": "It arrives within the time you wanted.",
  warranty: "The warranty is one the store really offers.",
  "warranty-need": "The warranty is as long as you wanted.",
  returns: "The return window matches the store’s published policy.",
  binding: "This is the store’s latest, real offer.",
  integrity: "Nobody changed the deal after it was agreed.",
  policy: "The store is allowed to sell at this price.",
  bundle: "The free extras are real items from this store.",
  budget: "It’s within your budget.",
  expiry: "The offer hasn’t expired.",
  // Payment checks
  "order-status": "PayPal marked the payment as complete.",
  "capture-status": "The money was actually collected.",
  amount: "You paid exactly the amount you approved.",
  currency: "You paid in US dollars, as agreed.",
  reference: "The payment is linked to this order.",
  terms: "The deal didn’t change after you approved it.",
  webhook: "PayPal’s confirmation message is genuine.",
  "card-cvv": "The card’s security code (CVV) matched.",
  "card-avs": "The billing address matched the card.",
};

export function friendlyCheck(c: VerificationCheck): string {
  if (c.id === "budget" && c.status === "unknown") return "You didn’t set a budget, so there was nothing to check.";
  if (c.id === "webhook" && c.status === "unknown") return "Still waiting for PayPal’s confirmation message.";
  if (c.id === "payee" && c.status === "unknown") return "The PayPal account is confirmed when you pay.";
  if (c.id === "card-cvv" && c.status === "fail") return "The security code (CVV) didn’t match, but the bank still approved it.";
  if (c.id === "card-cvv" && c.status === "unknown") return "The bank couldn’t check the security code.";
  if (c.id === "card-avs" && c.status === "fail") return "The billing address didn’t fully match, but the bank still approved it.";
  if (c.id === "card-avs" && c.status === "unknown") return "The bank couldn’t check the billing address.";
  return CHECK_TEXT[c.id] ?? c.label;
}
