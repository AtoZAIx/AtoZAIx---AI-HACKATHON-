import {
  INCENTIVE_LEVERS,
  type Cents,
  type IncentiveLever,
  type Listing,
  type MerchantPolicy,
  type MerchantProfile,
  type OfferBundleItem,
  type OfferTerms,
} from "../types";

export function offerTotal(terms: Pick<OfferTerms, "unitPriceCents" | "quantity" | "shippingCents">): Cents {
  return terms.unitPriceCents * terms.quantity + terms.shippingCents;
}

export function listTotal(listing: Listing, quantity: number): Cents {
  return listing.listPriceCents * quantity + listing.shippingCents;
}

export function bundleValue(bundle: OfferBundleItem[]): Cents {
  return bundle.reduce((sum, b) => sum + b.valueCents, 0);
}

const ceilDollar = (cents: number) => Math.ceil(cents / 100) * 100;

/**
 * What each non-price concession in `terms` costs the merchant, per order.
 * Shipping waived counts as lost revenue; warranty, express and bundle items
 * count at merchant cost.
 */
export function incentiveCostByLever(merchant: MerchantProfile, listing: Listing, terms: OfferTerms): Record<IncentiveLever, Cents> {
  const extraYears = Math.max(0, terms.warrantyMonths - listing.baseWarrantyMonths) / 12;
  const costOf = (id: string) => merchant.policy.bundleCatalog.find((b) => b.id === id)?.costCents ?? Infinity;
  return {
    warranty: Math.round(extraYears * listing.warrantyCostPerYearCents) * terms.quantity,
    express: terms.express ? listing.expressCostCents : 0,
    shipping: Math.max(0, listing.shippingCents - terms.shippingCents),
    bundle: terms.bundle.reduce((s, b) => s + costOf(b.id), 0) * terms.quantity,
  };
}

export function leverCost(merchant: MerchantProfile, listing: Listing, terms: OfferTerms): Cents {
  const c = incentiveCostByLever(merchant, listing, terms);
  return c.warranty + c.express + c.shipping + c.bundle;
}

/** Price concession funded by the merchant: (list − sold) × quantity. */
export function priceConcession(terms: OfferTerms): Cents {
  return Math.max(0, terms.listPriceCents - terms.unitPriceCents) * terms.quantity;
}

/**
 * The most the agents may ever take off list: the store's maximum discount
 * times its agent limit (50% max × 80% limit = never past 40%).
 */
export function agentDiscountCap(policy: Pick<MerchantPolicy, "maxDiscountPct" | "agentLimitPct">): number {
  return policy.maxDiscountPct * Math.min(1, Math.max(0, policy.agentLimitPct ?? 1));
}

/** The agent cap for one item: its own maximum discount when it has one (clearance), else the store's. */
export function itemDiscountCap(policy: Pick<MerchantPolicy, "maxDiscountPct" | "agentLimitPct">, listing: Pick<Listing, "maxDiscountPct">): number {
  return agentDiscountCap({ maxDiscountPct: listing.maxDiscountPct ?? policy.maxDiscountPct, agentLimitPct: policy.agentLimitPct });
}

/** The store's opening discount for one item (its own, for clearance stock). */
export function itemOpeningPct(policy: Pick<MerchantPolicy, "openingDiscountPct">, listing: Pick<Listing, "openingDiscountPct">): number {
  return Math.max(0, listing.openingDiscountPct ?? policy.openingDiscountPct ?? 0);
}

/**
 * The lowest unit price this merchant may accept for `terms`. It is the
 * strictest of: the agent's discount cap, the minimum selling price, cost plus
 * minimum profit, the minimum margin, and what the remaining concession
 * budget can fund. Incentive costs are added on top of the cost-based limits.
 */
export function minimumUnitPrice(merchant: MerchantProfile, listing: Listing, terms: OfferTerms): Cents {
  const p = merchant.policy;
  const perUnitIncentives = ceilDollar(leverCost(merchant, listing, terms) / terms.quantity);
  const byDiscount = ceilDollar(listing.listPriceCents * (1 - itemDiscountCap(p, listing)));
  const byFloor = listing.floorPriceCents + perUnitIncentives;
  const byProfit = listing.costCents + p.minProfitCents + perUnitIncentives;
  const byMargin = ceilDollar(listing.costCents / Math.max(0.01, 1 - p.minMarginPct)) + perUnitIncentives;
  const byBudget = p.remaining ? listing.listPriceCents - Math.floor(Math.max(0, p.remaining.concessionCents) / terms.quantity / 100) * 100 : 0;
  return Math.max(byDiscount, byFloor, byProfit, byMargin, byBudget);
}

export interface MutualDeal {
  unitPriceCents: Cents;
  /** Discount off list actually agreed (after rounding to whole dollars). */
  discountPct: number;
  askPct: number;
  /** The store's opening discount, after limits. */
  openingPct: number;
  /** The deepest discount allowed for these terms: the agent cap or a stricter floor. */
  limitPct: number;
  /** True when the shopper got everything they asked for. */
  askMet: boolean;
}

/**
 * The mutual deal when a shopper names a discount: halfway between the
 * store's opening discount and the shopper's ask, never past the agent cap or
 * any other floor. If the store already opens at or above the ask, the
 * shopper gets the opening. Example: max 50%, limit 80% (cap 40%), opening
 * 20%, ask 30% → 25%. Ask 60% → halfway to the cap, 30%.
 */
/** The mutual discount from three fractions: halfway from the opening to the ask, capped by the limit. */
export function mutualPct(openingPct: number, askPct: number, limitPct: number): number {
  const opening = Math.min(Math.max(0, openingPct), limitPct);
  const want = Math.min(Math.max(0, askPct), limitPct);
  return want <= opening ? opening : (opening + want) / 2;
}

export function mutualDeal(merchant: MerchantProfile, listing: Listing, terms: OfferTerms, askPct: number): MutualDeal {
  const list = listing.listPriceCents;
  const minUnit = minimumUnitPrice(merchant, listing, terms);
  const limitPct = Math.max(0, 1 - minUnit / list);
  const openingPct = Math.min(itemOpeningPct(merchant.policy, listing), limitPct);
  const pct = mutualPct(openingPct, askPct, limitPct);
  // Round up to a whole dollar so rounding never adds discount past the target.
  const unitPriceCents = Math.min(list, Math.max(minUnit, ceilDollar(list * (1 - pct))));
  const discountPct = 1 - unitPriceCents / list;
  return { unitPriceCents, discountPct, askPct, openingPct, limitPct, askMet: discountPct >= askPct - 0.0005 };
}

/** The store's opening price when a shopper names a discount. */
export function mutualOpeningPrice(merchant: MerchantProfile, listing: Listing, terms: OfferTerms): Cents {
  const minUnit = minimumUnitPrice(merchant, listing, terms);
  const pct = itemOpeningPct(merchant.policy, listing);
  return Math.min(listing.listPriceCents, Math.max(minUnit, ceilDollar(listing.listPriceCents * (1 - pct))));
}

/** True when every incentive in `terms` fits the merchant's remaining campaign allocation. */
export function incentivesAffordable(merchant: MerchantProfile, listing: Listing, terms: OfferTerms): boolean {
  const remaining = merchant.policy.remaining;
  if (!remaining) return true;
  const cost = incentiveCostByLever(merchant, listing, terms);
  return INCENTIVE_LEVERS.every((l) => cost[l] <= Math.max(0, remaining.incentiveCents[l]));
}

/** Snap down to a $…9 price when that stays at or above the minimum. */
export function snapPrice(price: Cents, min: Cents): Cents {
  const dollarsDown = Math.floor(price / 100);
  const charm = dollarsDown - ((((dollarsDown - 9) % 10) + 10) % 10);
  if (charm * 100 >= min && charm * 100 <= price) return charm * 100;
  return Math.max(min, Math.ceil(price / 100) * 100);
}
