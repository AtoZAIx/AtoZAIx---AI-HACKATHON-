import { getProduct } from "./catalog";
import { newId, nowIso } from "./ids";
import { MERCHANT_DIRECTORY as MERCHANTS } from "./directory";
import { formatMoney } from "./money";
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
    lineItems.push({ sku: "warranty-ext", name: `Warranty extended to ${t.warrantyMonths} months (included)`, kind: "warranty", quantity: 1, unitPriceCents: 0 });
  }
  if (t.express) lineItems.push({ sku: "express", name: `${t.deliveryDays}-day express delivery (included)`, kind: "service", quantity: 1, unitPriceCents: 0 });

  const subtotal = t.unitPriceCents * t.quantity;
  const listSubtotal = t.listPriceCents * t.quantity;
  const now = nowIso();
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
    savingsCents: listSubtotal - subtotal + Math.max(0, t.listShippingCents - t.shippingCents),
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
