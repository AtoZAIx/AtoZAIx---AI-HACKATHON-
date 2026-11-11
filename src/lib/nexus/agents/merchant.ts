import { fitScore, getProduct, meetsRequirements } from "../catalog";
import { newId, nowIso } from "../ids";
import { formatMoney } from "../money";
import { dealKind, vocabFor } from "../vocab";
import type {
  BuyerCounter,
  ConcessionLever,
  Listing,
  MerchantProfile,
  Offer,
  OfferBundleItem,
  OfferTerms,
  Product,
  PurchaseIntent,
} from "../types";
import { numbersConsistent } from "./guardrails";
import { bundleValue, incentivesAffordable, leverCost, minimumUnitPrice, mutualDeal, mutualOpeningPrice, offerTotal, snapPrice } from "./pricing";

export interface MerchantState {
  merchant: MerchantProfile;
  listing: Listing;
  product: Product;
  terms: OfferTerms;
  final: boolean;
  /** Offer version counter for this merchant. */
  version: number;
}

/** A merchant move proposed by an LLM strategist, before policy enforcement. */
export interface MoveProposal {
  unitPriceCents?: number;
  addWarrantyMonths?: number;
  express?: boolean;
  freeShipping?: boolean;
  bundleItemIds?: string[];
  final?: boolean;
  message?: string;
}

export interface RequestForQuote {
  intent: PurchaseIntent;
  /** Buyer's anchor for the delivered total. The real budget stays private. */
  targetTotalCents: number | null;
}

function baseTerms(merchant: MerchantProfile, listing: Listing, quantity: number): OfferTerms {
  return {
    listingId: listing.id,
    merchantId: merchant.id,
    productId: listing.productId,
    quantity,
    currency: "USD",
    listPriceCents: listing.listPriceCents,
    unitPriceCents: listing.listPriceCents,
    shippingCents: listing.shippingCents,
    listShippingCents: listing.shippingCents,
    warrantyMonths: listing.baseWarrantyMonths,
    deliveryDays: listing.standardDeliveryDays,
    express: false,
    returnDays: merchant.returnDays,
    bundle: [],
    expiresAt: expiry(merchant),
  };
}

/** Pick the listing this merchant wants to put forward for the RFQ. */
export function selectListing(merchant: MerchantProfile, listings: Listing[], rfq: RequestForQuote): Listing | null {
  const { intent } = rfq;
  if (!merchant.policy.active) return null;
  const candidates = listings.filter((l) => {
    if (l.merchantId !== merchant.id || l.stock < intent.quantity) return false;
    if (l.listPriceCents > l.maxSellingPriceCents) return false;
    // Skip listings the merchant can't sell even at its asking price.
    if (minimumUnitPrice(merchant, l, baseTerms(merchant, l, intent.quantity)) > l.listPriceCents) return false;
    return meetsRequirements(getProduct(l.productId), intent).ok;
  });
  if (!candidates.length) return null;

  const maxList = Math.max(...candidates.map((c) => c.listPriceCents));
  const anchorUnit = rfq.targetTotalCents ? rfq.targetTotalCents / intent.quantity : null;
  const reachable = anchorUnit
    ? candidates.filter((c) => minimumUnitPrice(merchant, c, baseTerms(merchant, c, intent.quantity)) <= anchorUnit * 1.2)
    : candidates;
  const pool = reachable.length ? reachable : [candidates.reduce((a, b) => (a.listPriceCents <= b.listPriceCents ? a : b))];

  const score = (l: Listing) => {
    const fit = fitScore(getProduct(l.productId), intent);
    const priceRank = l.listPriceCents / maxList;
    switch (merchant.archetype) {
      case "premium":
        return fit + priceRank * 0.2;
      case "competitive":
        return fit - priceRank * 0.15;
      case "retention":
        return fit + priceRank * 0.05;
    }
  };
  return pool.reduce((best, l) => (score(l) > score(best) ? l : best));
}

function expiry(merchant: MerchantProfile): string {
  return new Date(Date.now() + merchant.policy.offerValidityMinutes * 60_000).toISOString();
}

function applicableBundle(merchant: MerchantProfile, product: Product, existing: OfferTerms["bundle"]): OfferBundleItem[] {
  return merchant.policy.bundleCatalog
    .filter((b) => b.categories.includes(product.category) && !existing.some((e) => e.id === b.id))
    .map(({ id, name, valueCents }) => ({ id, name, valueCents }));
}

export function openingOffer(merchant: MerchantProfile, listing: Listing, rfq: RequestForQuote): { state: MerchantState; offer: Offer } {
  const product = getProduct(listing.productId);
  const terms = baseTerms(merchant, listing, rfq.intent.quantity);
  // Retention merchants lead with something extra in the box, if the
  // campaign budget and margin allow it.
  if (merchant.archetype === "retention") {
    const first = applicableBundle(merchant, product, [])[0];
    if (first) {
      const withGift = { ...terms, bundle: [first] };
      if (incentivesAffordable(merchant, listing, withGift) && minimumUnitPrice(merchant, listing, withGift) <= withGift.unitPriceCents) terms.bundle = [first];
    }
  }
  // Every store opens at its own opening discount (0% unless it sets one).
  terms.unitPriceCents = mutualOpeningPrice(merchant, listing, terms);
  const state: MerchantState = { merchant, listing, product, terms, final: false, version: 0 };
  const offer = makeOffer(state, 0, "opening", openingMessage(state), [], "policy");
  return { state, offer };
}

export function declineOffer(merchant: MerchantProfile, round: number, reason: string): Offer {
  return {
    id: newId("ofr"),
    round,
    merchantId: merchant.id,
    version: 0,
    kind: "declined",
    terms: null,
    totalCents: null,
    message: reason,
    levers: [],
    strategy: "policy",
    createdAt: nowIso(),
  };
}

function makeOffer(
  state: MerchantState,
  round: number,
  kind: Offer["kind"],
  message: string,
  levers: ConcessionLever[],
  strategy: Offer["strategy"],
  acceptsCounterId?: string,
): Offer {
  state.version += 1;
  return {
    id: newId("ofr"),
    round,
    merchantId: state.merchant.id,
    version: state.version,
    kind,
    terms: { ...state.terms, bundle: [...state.terms.bundle] },
    totalCents: offerTotal(state.terms),
    message,
    levers,
    strategy,
    acceptsCounterId,
    createdAt: nowIso(),
  };
}

interface RespondContext {
  round: number;
  maxRounds: number;
  proposal?: MoveProposal | null;
  /** The discount the buyer agent asks for (the shopper's, or the default). The store settles halfway to it. */
  askDiscountPct?: number | null;
  /** The discount the shopper named themselves, if any (used for wording only). */
  namedAskPct?: number | null;
}

const pctLabel = (f: number) => `${Math.round(f * 100)}%`;

/**
 * Policy-bound response to a buyer counter. A proposal (from Gemini) may
 * steer which levers move and by how much, but every number is clamped to
 * the merchant's policy and margin floor here.
 */
export function respondToCounter(state: MerchantState, counter: BuyerCounter, ctx: RespondContext): Offer {
  const { merchant, listing, product } = state;
  const policy = merchant.policy;
  const p = ctx.proposal ?? null;
  const prev = { ...state.terms, bundle: [...state.terms.bundle] };
  const next: OfferTerms = { ...prev, bundle: [...prev.bundle], expiresAt: expiry(merchant) };
  const moved: ConcessionLever[] = [];
  const lastRound = ctx.round >= ctx.maxRounds;

  // Margin check helper: can we afford a lever and still sell at or above floor?
  const affordable = (candidate: OfferTerms) =>
    minimumUnitPrice(merchant, listing, candidate) <= candidate.unitPriceCents && incentivesAffordable(merchant, listing, candidate);

  const tryLever = (lever: ConcessionLever) => {
    const draft: OfferTerms = { ...next, bundle: [...next.bundle] };
    switch (lever) {
      case "warranty": {
        const want = p?.addWarrantyMonths ?? (counter.ask.warrantyMonths ? counter.ask.warrantyMonths - next.warrantyMonths : 12);
        const add = Math.max(0, Math.min(listing.maxWarrantyMonths - next.warrantyMonths, Math.ceil(want / 12) * 12));
        if (!add) return false;
        draft.warrantyMonths = next.warrantyMonths + add;
        break;
      }
      case "express": {
        if (next.express || !(p?.express ?? counter.ask.express)) return false;
        draft.express = true;
        draft.deliveryDays = listing.expressDeliveryDays;
        break;
      }
      case "shipping": {
        if (next.shippingCents === 0 || p?.freeShipping === false) return false;
        draft.shippingCents = 0;
        break;
      }
      case "bundle": {
        const options = applicableBundle(merchant, product, next.bundle);
        const wanted = p?.bundleItemIds?.length ? options.filter((o) => p.bundleItemIds!.includes(o.id)) : options.slice(0, 1);
        const room = policy.maxBundleValueCents - bundleValue(next.bundle);
        const add = wanted.filter((w) => w.valueCents <= room).slice(0, 1);
        if (!add.length) return false;
        draft.bundle = [...next.bundle, ...add];
        break;
      }
      case "price":
        return false;
    }
    if (!affordable(draft)) return false;
    Object.assign(next, draft);
    moved.push(lever);
    return true;
  };

  // 1. Non-price levers: one per round. Levers the buyer explicitly asked
  //    for come first (in the merchant's order of preference), then the
  //    merchant's signature move.
  const nonPrice = policy.levers.filter((l) => l !== "price");
  const asked = (lever: ConcessionLever) =>
    (lever === "warranty" && Boolean(counter.ask.warrantyMonths)) ||
    (lever === "express" && Boolean(counter.ask.express)) ||
    (lever === "shipping" && Boolean(counter.ask.freeShipping)) ||
    (lever === "bundle" && Boolean(counter.ask.bundle));
  const signature = (lever: ConcessionLever) =>
    (merchant.archetype === "premium" && lever === "warranty") ||
    (merchant.archetype === "retention" && lever === "bundle") ||
    (merchant.archetype === "competitive" && lever === "shipping");
  const order: ConcessionLever[] = [...nonPrice.filter(asked), ...nonPrice.filter((l) => !asked(l) && signature(l))];
  if (p) {
    // Gemini picks levers; policy still decides if they're affordable.
    const llmOrder: ConcessionLever[] = [];
    if (p.addWarrantyMonths) llmOrder.push("warranty");
    if (p.express) llmOrder.push("express");
    if (p.freeShipping) llmOrder.push("shipping");
    if (p.bundleItemIds?.length) llmOrder.push("bundle");
    order.splice(0, order.length, ...llmOrder.filter((l) => policy.levers.includes(l)));
  }
  for (const lever of order) if (tryLever(lever)) break;

  // 2. Price: step toward the mutual deal, halfway between the store's opening
  // and the buyer's ask, within the agent limit and every floor. The store's
  // concession curve sets the pace; the last round lands on it exactly.
  const minUnit = minimumUnitPrice(merchant, listing, next);
  const deal = mutualDeal(merchant, listing, next, ctx.askDiscountPct ?? 0);
  const mutual = Math.max(minUnit, Math.min(next.unitPriceCents, deal.unitPriceCents));
  const curve = lastRound ? 1 : policy.concessionCurve[Math.min(ctx.round - 1, policy.concessionCurve.length - 1)];
  const room = Math.max(0, next.unitPriceCents - mutual);
  let price = next.unitPriceCents - Math.round(room * curve);

  if (p?.unitPriceCents !== undefined && !lastRound) {
    // LLM chose a price: clamp it into [mutual deal, previous price].
    price = Math.min(prev.unitPriceCents, Math.max(mutual, Math.round(p.unitPriceCents)));
  }

  let acceptsCounterId: string | undefined;
  if (counter.targetUnitPriceCents >= price && counter.targetUnitPriceCents <= prev.unitPriceCents) {
    price = counter.targetUnitPriceCents;
    acceptsCounterId = counter.id;
  }

  // Competitive merchants price-match the same model, minus a beat amount.
  // This is the store's own published policy, still bounded by the agent limit.
  let matched = false;
  if (policy.priceMatch && counter.leverage?.sameProduct) {
    const competitorUnit = Math.floor((counter.leverage.totalCents - next.shippingCents) / next.quantity) - policy.priceMatchBeatCents;
    if (competitorUnit >= minUnit && competitorUnit < price) {
      price = competitorUnit;
      acceptsCounterId = undefined;
      matched = true;
    }
  }

  // Charm-price snapping never moves past the mutual deal.
  price = acceptsCounterId || matched ? Math.max(minUnit, price) : snapPrice(Math.max(mutual, price), mutual);
  // Token concessions ($1 off a $1,000 laptop) read as noise: hold instead, except when landing on the deal.
  const step = prev.unitPriceCents - price;
  if (!acceptsCounterId && !lastRound && price > mutual && step > 0 && step < Math.max(300, prev.unitPriceCents * 0.004)) price = prev.unitPriceCents;
  if (price < prev.unitPriceCents) moved.unshift("price");
  next.unitPriceCents = price;

  const exhausted = price <= mutual && nonPrice.every((l) => !canStillMove(state, next, l));
  const final = lastRound || exhausted || Boolean(acceptsCounterId) || Boolean(p?.final && moved.length === 0);
  state.terms = next;
  state.final = final;

  const agreed = 1 - next.unitPriceCents / next.listPriceCents;
  const fallbackMessage =
    final && ctx.namedAskPct && !matched
      ? agreed >= ctx.namedAskPct - 0.0005
        ? `You asked for ${pctLabel(ctx.namedAskPct)} off, and we can do that: ${formatMoney(next.unitPriceCents)}, ${pctLabel(agreed)} off list. That’s our final offer.`
        : `You asked for ${pctLabel(ctx.namedAskPct)} off. Let’s meet in the middle: ${formatMoney(next.unitPriceCents)}, ${pctLabel(agreed)} off list. That’s our final offer.`
      : counterMessage(state, prev, moved, final, acceptsCounterId !== undefined, counter);
  const allowed = [
    next.unitPriceCents,
    offerTotal(next),
    prev.unitPriceCents,
    offerTotal(prev),
    next.shippingCents,
    listing.shippingCents,
    listing.listPriceCents,
    counter.targetUnitPriceCents,
    ...(counter.leverage ? [counter.leverage.totalCents] : []),
    prev.unitPriceCents - next.unitPriceCents,
    ...next.bundle.map((b) => b.valueCents),
  ];
  const llmMessage = p?.message?.trim();
  const message = llmMessage && numbersConsistent(llmMessage, allowed) ? llmMessage : fallbackMessage;
  const offer = makeOffer(state, ctx.round, final ? "final" : "counter", message, moved, p ? "gemini+policy" : "policy", acceptsCounterId);
  const messageRejected = Boolean(llmMessage) && message !== llmMessage;
  const priceClamped = p?.unitPriceCents !== undefined && Math.round(p.unitPriceCents) < mutual;
  if (messageRejected || priceClamped) offer.guardrail = { messageRejected, priceClamped };
  return offer;
}

function canStillMove(state: MerchantState, terms: OfferTerms, lever: ConcessionLever): boolean {
  const { listing, merchant, product } = state;
  switch (lever) {
    case "warranty":
      return terms.warrantyMonths < listing.maxWarrantyMonths;
    case "express":
      return !terms.express;
    case "shipping":
      return terms.shippingCents > 0;
    case "bundle":
      return applicableBundle(merchant, product, terms.bundle).some(
        (b) => b.valueCents <= merchant.policy.maxBundleValueCents - bundleValue(terms.bundle),
      );
    default:
      return false;
  }
}

export function merchantFloorForTerms(state: MerchantState): number {
  return minimumUnitPrice(state.merchant, state.listing, state.terms);
}

export { leverCost };

// ---------- Message templates (used directly, or as the LLM fallback) ----------

function openingMessage(state: MerchantState): string {
  const { merchant, product, terms } = state;
  const total = formatMoney(offerTotal(terms));
  if (dealKind(product.category) !== "goods") return ownerOpening(state);
  switch (merchant.archetype) {
    case "premium":
      return `We'd recommend the ${product.name}. ${formatMoney(terms.unitPriceCents)} with our ${terms.warrantyMonths}-month warranty and complimentary ${terms.deliveryDays}-day delivery — ${total} all in.`;
    case "competitive":
      return `${product.name} in stock now: ${formatMoney(terms.unitPriceCents)}${terms.shippingCents ? ` + ${formatMoney(terms.shippingCents)} shipping` : ", free shipping"}. ${total} delivered. Bring me a better quote and I'll look at it.`;
    case "retention":
      return `For you we'd suggest the ${product.name} at ${formatMoney(terms.unitPriceCents)}, and we'll include a ${terms.bundle[0]?.name.toLowerCase() ?? "welcome gift"} in the box. ${total} delivered free.`;
  }
}

function counterMessage(
  state: MerchantState,
  prev: OfferTerms,
  moved: ConcessionLever[],
  final: boolean,
  accepted: boolean,
  counter: BuyerCounter,
): string {
  const { merchant, terms } = state;
  const total = formatMoney(offerTotal(terms));
  if (dealKind(state.product.category) !== "goods") return ownerCounter(state, prev, moved, final, accepted);
  const bits: string[] = [];
  if (moved.includes("price")) bits.push(`${formatMoney(terms.unitPriceCents)} (down from ${formatMoney(prev.unitPriceCents)})`);
  if (moved.includes("warranty")) bits.push(`${terms.warrantyMonths}-month warranty`);
  if (moved.includes("express")) bits.push(`${terms.deliveryDays}-day express delivery`);
  if (moved.includes("shipping")) bits.push("shipping waived");
  if (moved.includes("bundle")) bits.push(`${terms.bundle[terms.bundle.length - 1].name.toLowerCase()} included`);
  const what = bits.length ? bits.join(", ") : `holding at ${formatMoney(terms.unitPriceCents)}`;

  if (accepted) {
    return merchant.archetype === "premium"
      ? `We can meet you at ${formatMoney(terms.unitPriceCents)}. ${total} delivered — that's our final position.`
      : merchant.archetype === "competitive"
        ? `Deal — ${formatMoney(terms.unitPriceCents)}, ${total} delivered. Locked.`
        : `Happy to meet you at ${formatMoney(terms.unitPriceCents)}, with everything already in the box. ${total} delivered.`;
  }
  const citing = counter.leverage?.sameProduct && merchant.policy.priceMatch && moved.includes("price");
  switch (merchant.archetype) {
    case "premium":
      return `${final ? "Our best and final: " : "We can offer "}${what}. ${total} delivered.${final ? "" : " Our service standard doesn't leave much room on price."}`;
    case "competitive":
      return `${citing ? "Matched and beat it: " : final ? "Floor price, final: " : "Okay — "}${what}. ${total} delivered.`;
    case "retention":
      return `${final ? "Our final package: " : "Here's what we can do: "}${what}. ${total} delivered, and we'll look after you after the sale.`;
  }
}

// ---------- Land, houses, rentals and cars: the store's agent speaks for the owner ----------

function ownerOpening(state: MerchantState): string {
  const { merchant, product, terms } = state;
  const v = vocabFor(product.category);
  const price = `${formatMoney(terms.unitPriceCents)}${v.priceSuffix}`;
  const total = `${formatMoney(offerTotal(terms))} ${v.totalSuffix}`;
  const extras = [v.fees(terms.shippingCents), v.delivery(terms.deliveryDays, terms.express), v.warranty(terms.warrantyMonths)].filter(Boolean).join(", ");
  switch (merchant.archetype) {
    case "premium":
      return `On behalf of the owner: the ${product.name} at ${price}, ${extras}. ${total}.`;
    case "competitive":
      return `${product.name} is available at ${price}, ${extras}. ${total}. Bring me a better quote and I'll take it to the owner.`;
    case "retention":
      return `The owner would accept ${price} for the ${product.name}, ${extras}. ${total}, and we'll help you with the paperwork.`;
  }
}

function ownerCounter(state: MerchantState, prev: OfferTerms, moved: ConcessionLever[], final: boolean, accepted: boolean): string {
  const { merchant, product, terms } = state;
  const v = vocabFor(product.category);
  const price = `${formatMoney(terms.unitPriceCents)}${v.priceSuffix}`;
  const total = `${formatMoney(offerTotal(terms))} ${v.totalSuffix}`;
  const bits: string[] = [];
  if (moved.includes("price")) bits.push(`${price} (down from ${formatMoney(prev.unitPriceCents)}${v.priceSuffix})`);
  if (moved.includes("warranty") && v.warranty(terms.warrantyMonths)) bits.push(v.warranty(terms.warrantyMonths)!);
  if (moved.includes("express")) bits.push(v.delivery(terms.deliveryDays, true));
  if (moved.includes("shipping")) bits.push(v.fees(0));
  if (moved.includes("bundle")) bits.push(`${terms.bundle[terms.bundle.length - 1].name.toLowerCase()} included`);
  const what = bits.length ? bits.join(", ") : `${price}, unchanged`;
  if (accepted) return `The owner accepts ${price}. ${total}${merchant.archetype === "competitive" ? ". Locked." : "."}`;
  switch (merchant.archetype) {
    case "premium":
      return `${final ? "The owner's best and final: " : "The owner can offer "}${what}. ${total}.`;
    case "competitive":
      return `${final ? "Lowest the owner will go: " : "Okay, "}${what}. ${total}.`;
    case "retention":
      return `${final ? "The owner's final offer: " : "Here's what the owner can do: "}${what}. ${total}, and we'll stay with you until the keys are handed over.`;
  }
}
