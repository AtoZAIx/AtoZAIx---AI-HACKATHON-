import { formatMoney } from "../money";
import { reportOk } from "../verification";
import type { CheckStatus, NexusOrder, VerificationCheck, VerificationReport } from "../types";
import type { ExpectedPayee, PaymentView } from "./gateway";

function samePayee(expected: ExpectedPayee | null, actual: ExpectedPayee | null): boolean {
  if (!expected || !actual) return false;
  if (expected.merchantId && actual.merchantId) return expected.merchantId === actual.merchantId;
  if (expected.email && actual.email) return expected.email.toLowerCase() === actual.email.toLowerCase();
  return false;
}

function describePayee(p: ExpectedPayee | null): string {
  if (!p) return "unknown";
  return p.merchantId ?? p.email ?? "unknown";
}

/**
 * Authoritative payment verification. Runs against the provider's own record
 * of the order (re-fetched server-side after capture), never the browser.
 */
export function verifyPayment(order: NexusOrder, view: PaymentView, opts: { webhookRequired: boolean }): VerificationReport {
  const at = new Date().toISOString();
  const checks: VerificationCheck[] = [];
  const add = (category: string, id: string, label: string, status: CheckStatus | boolean, essential: boolean, detail: string, evidence: string[]) =>
    checks.push({ id, category, label, status: typeof status === "boolean" ? (status ? "pass" : "fail") : status, essential, detail, evidence, checkedAt: at });
  const expectedPayee = order.payment?.expectedPayee ?? null;

  add("Capture", "order-status", "PayPal order completed", view.orderStatus === "COMPLETED", true, `Order ${view.paypalOrderId} is ${view.orderStatus}`, [
    "Re-read from the payment provider after capture",
  ]);
  add(
    "Capture",
    "capture-status",
    "Capture completed",
    view.captureStatus === "COMPLETED",
    true,
    view.captureId ? `Capture ${view.captureId} is ${view.captureStatus}` : "No capture found",
    view.captureId ? [`Capture id ${view.captureId}`] : [],
  );
  add(
    "Amount and currency",
    "amount",
    "Captured amount matches approval",
    view.amountCents === order.totalCents && order.approval?.amountCents === order.totalCents,
    true,
    `Captured ${view.amountCents === null ? "nothing" : formatMoney(view.amountCents)}, approved ${order.approval ? formatMoney(order.approval.amountCents) : "nothing"}`,
    [`Order total ${formatMoney(order.totalCents)}`],
  );
  add("Amount and currency", "currency", "Currency matches", view.currency === order.currency, true, `${view.currency ?? "—"} vs ${order.currency}`, []);
  add(
    "Payee",
    "payee",
    "Paid to the agreed merchant",
    samePayee(expectedPayee, view.payee),
    true,
    `Payee ${describePayee(view.payee)}, expected ${describePayee(expectedPayee)}`,
    ["Expected payee pinned when the PayPal order was created"],
  );
  add(
    "Order linkage",
    "reference",
    "Linked to this Nexus order",
    view.customId === order.id && view.invoiceId === `NEXUS-${order.id}`,
    true,
    `custom_id ${view.customId ?? "—"} · invoice ${view.invoiceId ?? "—"}`,
    [],
  );
  add(
    "Order linkage",
    "terms",
    "Terms unchanged since approval",
    order.approval?.termsHash === order.termsHash && order.approval?.agreementVersion === order.agreementVersion,
    true,
    `Agreement v${order.agreementVersion} · ${order.termsHash.slice(0, 10)}…`,
    [`Approved hash ${order.approval?.termsHash.slice(0, 10) ?? "—"}…`],
  );

  // Card risk signals from the test card network (advisory: the issuer still approved).
  const card = order.payment?.method === "card" ? [...(order.payment.cardAttempts ?? [])].reverse().find((a) => a.approved) : undefined;
  if (card) {
    add(
      "Card checks",
      "card-cvv",
      "Card security code matched",
      card.cvv2Match === "Y" ? "pass" : card.cvv2Match === "N" ? "fail" : "unknown",
      false,
      `CVV2MATCH=${card.cvv2Match ?? "not submitted"}`,
      [`${card.brand ?? "Card"} ending ${card.last4}`, `RESULT ${card.result} ${card.respmsg}`],
    );
    const avs = card.avsAddr === "Y" && card.avsZip === "Y" ? "pass" : card.avsAddr === "N" || card.avsZip === "N" ? "fail" : "unknown";
    add("Card checks", "card-avs", "Billing address matched", avs, false, `AVSADDR=${card.avsAddr ?? "-"} · AVSZIP=${card.avsZip ?? "-"}`, [
      "Address Verification Service result from the test card network",
    ]);
  }

  const hook = order.payment?.webhooks.find((w) => w.eventType === "PAYMENT.CAPTURE.COMPLETED" && w.signatureVerified);
  const badHook = order.payment?.webhooks.find((w) => !w.signatureVerified);
  add(
    "Webhook",
    "webhook",
    "Webhook signature verified",
    hook ? "pass" : "unknown",
    opts.webhookRequired,
    hook
      ? `${hook.eventType} · ${hook.eventId}`
      : opts.webhookRequired
        ? "Awaiting a signed PAYMENT.CAPTURE.COMPLETED event"
        : "Not received. Optional in sandbox: set PAYPAL_WEBHOOK_ID and expose /api/paypal/webhook publicly",
    [...(hook ? [`Received ${hook.receivedAt}`] : []), ...(badHook ? [`Rejected unsigned event ${badHook.eventId}`] : [])],
  );

  return { ok: reportOk(checks), checkedAt: at, checks };
}
