import { getProduct } from "./catalog";
import { newId, nowIso } from "./ids";
import { MERCHANT_DIRECTORY as MERCHANTS } from "./directory";
import { formatMoney } from "./money";
import { bookingToken, vocabFor } from "./vocab";
import type { Agreement, Listing, NexusOrder, OrderLineItem } from "./types";

/** Turn a verified agreement into an order awaiting the customer's approval. */
export function prepareOrder(agreement: Agreement, listing: Listing): NexusOrder {
  const t = agreement.terms;
  const product = getProduct(t.productId);
  const merchant = MERCHANTS[t.merchantId];
  const lineItems: OrderLineItem[] = [
    { sku: product.id, name: product.name, kind: "product", quantity: t.quantity, unitPriceCents: t.unitPriceCents },
  ];
  for (const b of t.bundle) lineItems.push({ sku: `bundle-${b.id}`, name: `${b.name} (included)`, kind: "bundle", quantity: t.quantity, unitPriceCents: 0 });
  if (t.warrantyMonths > listing.baseWarrantyMonths) {
    lineItems.push({ sku: "warranty-ext", name: `${t.warrantyMonths % 12 === 0 && t.warrantyMonths >= 48 ? `Warranty extended to ${t.warrantyMonths / 12} years` : `Warranty extended to ${t.warrantyMonths} months`} (included)`, kind: "warranty", quantity: 1, unitPriceCents: 0 });
  }
  if (t.express) lineItems.push({ sku: "express", name: `${capitalize(vocabFor(product.category).delivery(t.deliveryDays, true))} (included)`, kind: "service", quantity: 1, unitPriceCents: 0 });

  const dealSubtotal = t.unitPriceCents * t.quantity;
  const dealListSubtotal = t.listPriceCents * t.quantity;
  const dealTotal = dealSubtotal + t.shippingCents;
  const savings = dealListSubtotal - dealSubtotal + Math.max(0, t.listShippingCents - t.shippingCents);
  const now = nowIso();

  // Property, rentals and cars: PayPal takes only a refundable booking token now;
  // the agreed price is settled with the seller at closing, outside this app.
  const token = bookingToken(product.category, dealTotal);
  if (token) {
    const v = vocabFor(product.category);
    const bookingLines: OrderLineItem[] = [
      { sku: `booking-${product.id}`, name: `Refundable booking token: ${product.name}`, kind: "product", quantity: 1, unitPriceCents: token.tokenCents },
      ...lineItems.filter((l) => l.kind !== "product"),
    ];
    return {
      id: newId("ord"),
      sessionId: agreement.sessionId,
      agreementId: agreement.id,
      merchantId: t.merchantId,
      status: "awaiting_approval",
      agreementVersion: agreement.version,
      currency: t.currency,
      lineItems: bookingLines,
      subtotalCents: token.tokenCents,
      listSubtotalCents: token.tokenCents,
      savingsCents: savings,
      shippingCents: 0,
      totalCents: token.tokenCents,
      booking: { dealTotalCents: dealTotal, balanceDueCents: dealTotal - token.tokenCents, rule: token.rule, refundable: true },
      terms: t,
      termsHash: agreement.termsHash,
      signature: agreement.signature,
      approval: null,
      payment: null,
      timeline: [
        { at: agreement.agreedAt, label: "Deal agreed", detail: `${merchant.name} accepted ${formatMoney(dealTotal)} ${v.totalSuffix} (terms ${agreement.termsHash.slice(0, 10)}…)`, status: "done" },
        {
          at: agreement.verification.checkedAt,
          label: "Deal verified",
          detail: `${agreement.verification.checks.filter((c) => c.essential).length} essential checks passed (agreement v${agreement.version})`,
          status: "done",
        },
        { at: now, label: "Booking prepared", detail: `Refundable booking token ${formatMoney(token.tokenCents)} awaiting your approval; ${formatMoney(dealTotal - token.tokenCents)} is settled with the seller at closing`, status: "info" },
      ],
      createdAt: now,
      updatedAt: now,
    };
  }

  const subtotal = dealSubtotal;
  const listSubtotal = dealListSubtotal;
  return {
    id: newId("ord"),
    sessionId: agreement.sessionId,
    agreementId: agreement.id,
    merchantId: t.merchantId,
    status: "awaiting_approval",
    agreementVersion: agreement.version,
    currency: t.currency,
    lineItems,
    subtotalCents: subtotal,
    listSubtotalCents: listSubtotal,
    savingsCents: savings,
    shippingCents: t.shippingCents,
    totalCents: subtotal + t.shippingCents,
    terms: t,
    termsHash: agreement.termsHash,
    signature: agreement.signature,
    approval: null,
    payment: null,
    timeline: [
      { at: agreement.agreedAt, label: "Deal agreed", detail: `${merchant.name} accepted terms ${agreement.termsHash.slice(0, 10)}…`, status: "done" },
      {
        at: agreement.verification.checkedAt,
        label: "Deal verified",
        detail: `${agreement.verification.checks.filter((c) => c.essential).length} essential checks passed (agreement v${agreement.version})`,
        status: "done",
      },
      { at: now, label: "Order prepared", detail: `${formatMoney(subtotal + t.shippingCents)} awaiting your approval`, status: "info" },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
