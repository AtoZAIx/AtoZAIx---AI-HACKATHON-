import { bundleValue } from "./agents/pricing";
import type { CommerceSession, MerchantId, Offer } from "./types";

/** Customer-visible facts about a merchant's latest offer (no private data). */
export function offerFacts(session: CommerceSession, offer: Offer) {
  const t = offer.terms!;
  const first = session.offers.find((o) => o.merchantId === offer.merchantId && o.version === 1)?.terms ?? t;
  const listTotal = t.listPriceCents * t.quantity + t.listShippingCents;
  const total = offer.totalCents!;
  const incentives: string[] = [];
  if (t.listShippingCents > t.shippingCents) incentives.push("Shipping waived");
  if (t.express) incentives.push(`${t.deliveryDays}-day express`);
  if (t.warrantyMonths > first.warrantyMonths) incentives.push(`Warranty +${t.warrantyMonths - first.warrantyMonths} months`);
  for (const b of t.bundle) incentives.push(b.name);
  return {
    listTotal,
    total,
    savings: Math.max(0, listTotal - total),
    discountPct: listTotal ? Math.max(0, (listTotal - total) / listTotal) : 0,
    incentives,
    bundleValue: bundleValue(t.bundle),
  };
}

export function latestOffers(session: CommerceSession): Partial<Record<MerchantId, Offer>> {
  const out: Partial<Record<MerchantId, Offer>> = {};
  for (const o of session.offers) out[o.merchantId] = o;
  return out;
}

export function verificationOf(session: CommerceSession, offerId: string): "verified" | "failed" | "not-verified" {
  if (session.agreement?.offerId !== offerId) return "not-verified";
  return session.agreement.verification.ok ? "verified" : "failed";
}
