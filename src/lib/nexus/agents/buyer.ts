import { fitScore, getProduct, meetsRequirements } from "../catalog";
import { MERCHANT_DIRECTORY as MERCHANTS } from "../directory";
import { newId, nowIso } from "../ids";
import { formatMoney } from "../money";
import type { BuyerCounter, Offer, Priority, PurchaseIntent, RankedOffer, ScoreBreakdown } from "../types";
import { bundleValue } from "./pricing";

/** How much each non-price term is worth to the buyer, by priority. */
const VALUATION: Record<Priority, { warrantyPerYear: number; deliveryPerDay: number; extras: number }> = {
  balanced: { warrantyPerYear: 0.03, deliveryPerDay: 0.006, extras: 0.5 },
  price: { warrantyPerYear: 0.012, deliveryPerDay: 0.002, extras: 0.25 },
  warranty: { warrantyPerYear: 0.08, deliveryPerDay: 0.004, extras: 0.4 },
  delivery: { warrantyPerYear: 0.02, deliveryPerDay: 0.02, extras: 0.4 },
  value: { warrantyPerYear: 0.04, deliveryPerDay: 0.004, extras: 0.85 },
};

/**
 * How the final score combines effective cost, the stated priority and spec
 * fit. A balanced brief ranks purely on effective cost and fit.
 */
const PRIORITY_WEIGHTS: Record<Priority, { cost: number; priority: number; fit: number }> = {
  balanced: { cost: 0.8, priority: 0, fit: 0.2 },
  price: { cost: 0.6, priority: 0.25, fit: 0.15 },
  warranty: { cost: 0.35, priority: 0.5, fit: 0.15 },
  delivery: { cost: 0.6, priority: 0.25, fit: 0.15 },
  value: { cost: 0.6, priority: 0.25, fit: 0.15 },
};

/** The anchor the buyer shares in the RFQ: well under the private budget. */
export function anchorFor(intent: PurchaseIntent): number | null {
  return intent.budgetCents ? Math.round((intent.budgetCents * 0.82) / 1000) * 1000 : null;
}

/**
 * Rank live offers on the buyer's priorities. Each offer gets an
 * "effective cost": delivered total minus what its warranty, delivery speed
 * and extras are worth to this buyer. Budget and specs are hard gates.
 */
export function rankOffers(offers: Offer[], intent: PurchaseIntent): RankedOffer[] {
  const live = offers.filter((o) => o.terms && o.totalCents !== null);
  if (!live.length) return [];
  const v = VALUATION[intent.priority];

  const rows = live.map((o) => {
    const t = o.terms!;
    const product = getProduct(t.productId);
    const total = o.totalCents!;
    const listTotal = t.listPriceCents * t.quantity + t.listShippingCents;
    const withinBudget = !intent.budgetCents || total <= intent.budgetCents;
    const req = meetsRequirements(product, intent);
    const warrantyOk = !intent.minWarrantyMonths || t.warrantyMonths >= intent.minWarrantyMonths;
    const deliveryOk = !intent.maxDeliveryDays || t.deliveryDays <= intent.maxDeliveryDays;
    const extras = bundleValue(t.bundle) * t.quantity;

    const breakdown: Omit<ScoreBreakdown, "costScore" | "priorityScore" | "weights"> = {
      priceCents: total,
      warrantyValueCents: Math.round((Math.max(0, t.warrantyMonths - 12) / 12) * v.warrantyPerYear * total),
      deliveryValueCents: Math.round(Math.max(0, 5 - t.deliveryDays) * v.deliveryPerDay * total),
      extrasValueCents: Math.round(extras * v.extras),
      penaltyCents: Math.round(((warrantyOk ? 0 : 0.05) + (deliveryOk ? 0 : 0.05)) * total),
      fit: fitScore(product, intent),
    };
    const effective =
      total - breakdown.warrantyValueCents - breakdown.deliveryValueCents - breakdown.extrasValueCents + breakdown.penaltyCents;
    return { o, t, total, listTotal, withinBudget, req, warrantyOk, deliveryOk, extras, breakdown, effective };
  });

  const minEffective = Math.min(...rows.map((r) => r.effective));
  const minTotal = Math.min(...rows.map((r) => r.total));
  const maxWarranty = Math.max(...rows.map((r) => r.t.warrantyMonths));
  const minDays = Math.min(...rows.map((r) => r.t.deliveryDays));
  const maxExtras = Math.max(1, ...rows.map((r) => r.extras));
  const w = PRIORITY_WEIGHTS[intent.priority];

  const ranked = rows.map((r) => {
    const costScore = minEffective / r.effective;
    const priorityScore =
      intent.priority === "warranty"
        ? r.t.warrantyMonths / maxWarranty
        : intent.priority === "delivery"
          ? minDays / r.t.deliveryDays
          : intent.priority === "value"
            ? r.extras / maxExtras
            : intent.priority === "price"
              ? minTotal / r.total
              : 0;
    let score = 100 * (w.cost * costScore + w.priority * priorityScore + w.fit * r.breakdown.fit);
    if (!r.withinBudget) score *= 0.4;
    if (!r.req.ok) score *= 0.3;

    const reasons: string[] = [];
    if (r.total === minTotal) reasons.push("Lowest price");
    if (r.breakdown.warrantyValueCents > 0) reasons.push(`${r.t.warrantyMonths}-month warranty`);
    if (r.t.deliveryDays <= 2) reasons.push(`${r.t.deliveryDays}-day delivery`);
    if (r.extras > 0) reasons.push(`${formatMoney(r.extras)} of extras included`);
    if (!r.withinBudget) reasons.push(`Over budget by ${formatMoney(r.total - intent.budgetCents!)}`);
    if (!r.warrantyOk) reasons.push(`Warranty below ${intent.minWarrantyMonths} months`);
    if (!r.deliveryOk) reasons.push(`Delivery slower than ${intent.maxDeliveryDays} days`);
    if (!r.req.ok) reasons.push(...r.req.misses);

    return {
      offerId: r.o.id,
      merchantId: r.o.merchantId,
      score: Math.round(score * 10) / 10,
      totalCents: r.total,
      effectiveCents: r.effective,
      savingsCents: Math.max(0, r.listTotal - r.total),
      withinBudget: r.withinBudget,
      meetsRequirements: r.req.ok && r.warrantyOk && r.deliveryOk,
      breakdown: { ...r.breakdown, costScore, priorityScore, weights: w },
      reasons,
    } satisfies RankedOffer;
  });
  return ranked.sort((a, b) => b.score - a.score);
}

/** What the buyer agent asks for when the shopper doesn't name a discount. */
export const DEFAULT_ASK_PCT = 0.2;

/** The discount the buyer agent asks for: the shopper's own, but never less than the default, so naming one never hurts. */
export function effectiveAsk(intent: Pick<PurchaseIntent, "askDiscountPct">): number {
  return Math.max(intent.askDiscountPct ?? 0, DEFAULT_ASK_PCT);
}

/**
 * Build the buyer's counteroffer to one merchant, citing the strongest
 * competing quote as leverage. Never reveals the budget.
 */
export function buildCounter(
  offer: Offer,
  allLatest: Offer[],
  intent: PurchaseIntent,
  round: number,
): BuyerCounter {
  const t = offer.terms!;
  const named = intent.askDiscountPct ?? null;
  // The ask is the same every round; the store's curve sets how fast it moves.
  let target = Math.round(t.listPriceCents * (1 - effectiveAsk(intent)));

  const rivals = allLatest.filter((o) => o.merchantId !== offer.merchantId && o.terms && o.totalCents! < offer.totalCents!);
  const sameModel = rivals.filter((o) => o.terms!.productId === t.productId).sort((a, b) => a.totalCents! - b.totalCents!)[0];
  const cheapest = rivals.sort((a, b) => a.totalCents! - b.totalCents!)[0];
  const lever = sameModel ?? cheapest ?? null;

  if (lever) {
    const rivalUnit = Math.floor((lever.totalCents! - t.shippingCents) / t.quantity);
    if (lever === sameModel) target = Math.min(target, rivalUnit - 1500);
  }
  if (intent.budgetCents && offer.totalCents! > intent.budgetCents) {
    target = Math.min(target, Math.floor((intent.budgetCents - t.shippingCents) / t.quantity) - 2000);
  }
  // Stay credible: without the shopper's own ask, never ask for more than the default off list.
  if (!named) target = Math.max(target, Math.round(t.listPriceCents * (1 - DEFAULT_ASK_PCT)));
  target = Math.floor(target / 100) * 100;

  const asks: BuyerCounter["ask"] = {};
  if (intent.priority === "warranty" || (intent.minWarrantyMonths && t.warrantyMonths < intent.minWarrantyMonths)) {
    asks.warrantyMonths = Math.max(intent.minWarrantyMonths ?? 0, t.warrantyMonths + 12);
  }
  if (intent.priority === "delivery" || (intent.maxDeliveryDays && t.deliveryDays > intent.maxDeliveryDays)) {
    if (!t.express) asks.express = true;
  }
  if (t.shippingCents > 0) asks.freeShipping = true;
  if (intent.priority === "value") asks.bundle = true;

  const counter: BuyerCounter = {
    id: newId("ctr"),
    round,
    merchantId: offer.merchantId,
    targetUnitPriceCents: target,
    ask: asks,
    leverage: lever
      ? {
          merchantId: lever.merchantId,
          productId: lever.terms!.productId,
          totalCents: lever.totalCents!,
          sameProduct: lever.terms!.productId === t.productId,
        }
      : null,
    message: "",
    createdAt: nowIso(),
  };
  counter.message = named
    ? `My shopper is asking for ${Math.round(named * 100)}% off list: ${formatMoney(target)}. Can you meet them on that?`
    : counterMessage(counter, offer);
  return counter;
}

function counterMessage(c: BuyerCounter, offer: Offer): string {
  const merchant = MERCHANTS[offer.merchantId];
  const parts: string[] = [];
  if (c.leverage) {
    const rival = MERCHANTS[c.leverage.merchantId].name;
    parts.push(
      c.leverage.sameProduct
        ? `${rival} has the same model at ${formatMoney(c.leverage.totalCents)} delivered.`
        : `${rival} is at ${formatMoney(c.leverage.totalCents)} delivered for a comparable spec.`,
    );
  }
  const asks: string[] = [`${formatMoney(c.targetUnitPriceCents)}`];
  if (c.ask.freeShipping) asks.push("free shipping");
  if (c.ask.warrantyMonths) asks.push(`${c.ask.warrantyMonths}-month warranty`);
  if (c.ask.express) asks.push("express delivery");
  if (c.ask.bundle) asks.push("accessories in the box");
  const list = asks.length > 1 ? `${asks.slice(0, -1).join(", ")} and ${asks[asks.length - 1]}` : asks[0];
  parts.push(`${merchant.name}, can you do ${list}?`);
  return parts.join(" ");
}

export function describeRanking(ranked: RankedOffer[], offers: Offer[]): string {
  const best = ranked[0];
  if (!best) return "No merchant could meet the requirements. Try relaxing the budget or specs.";
  const offer = offers.find((o) => o.id === best.offerId)!;
  const t = offer.terms!;
  const product = getProduct(t.productId);
  const head = `I recommend ${MERCHANTS[best.merchantId].name}: ${product.name} for ${formatMoney(best.totalCents)} delivered`;
  const extras = [
    best.savingsCents > 0 ? `${formatMoney(best.savingsCents)} below list` : null,
    `${t.warrantyMonths}-month warranty`,
    `${t.deliveryDays}-day delivery`,
    t.bundle.length ? `plus ${t.bundle.map((b) => b.name.toLowerCase()).join(" and ")}` : null,
  ].filter(Boolean);
  const runner = ranked[1];
  let alt = "";
  if (runner) {
    const ro = offers.find((o) => o.id === runner.offerId)!;
    const diff = runner.totalCents - best.totalCents;
    alt = ` ${MERCHANTS[runner.merchantId].name} is ${diff >= 0 ? `${formatMoney(diff)} more` : `${formatMoney(-diff)} less`} with ${ro.terms!.warrantyMonths}-month warranty${ro.terms!.bundle.length ? " and extras" : ""}.`;
  }
  const gate = best.withinBudget ? "" : " Note: no offer fits your budget, so this is the closest.";
  return `${head} (${extras.join(", ")}).${alt}${gate}`;
}
