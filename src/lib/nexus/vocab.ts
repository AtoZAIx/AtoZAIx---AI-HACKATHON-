import { dollars, formatMoney } from "./money";
import { BOOKING_CATEGORIES, type Category, type Cents } from "./types";

/**
 * How each kind of deal is described, so a house reads like a house and a
 * laptop like a laptop. The underlying terms are the same fields:
 * deliveryDays = delivery / possession / move-in; shippingCents = shipping /
 * closing fees / broker fee / destination fee; returnDays = returns or the
 * cancellation window; warrantyMonths = 0 when it doesn't apply.
 */
export type DealKind = "goods" | "property" | "rental" | "vehicle";

export function dealKind(category: Category): DealKind {
  if (category === "land" || category === "house") return "property";
  if (category === "rental") return "rental";
  if (category === "car") return "vehicle";
  return "goods";
}

export const isBooking = (category: Category) => BOOKING_CATEGORIES.includes(category);

interface Vocab {
  /** "delivered", "incl. fees", "a month" … used after a total. */
  totalSuffix: string;
  /** "/month" for rent, "" otherwise. */
  priceSuffix: string;
  delivery: (days: number, express: boolean) => string;
  deliveryNoun: string;
  fees: (cents: Cents) => string;
  feesNoun: string;
  freeFeesAsk: string;
  fasterAsk: string;
  warranty: (months: number) => string | null;
  returns: (days: number) => string;
  returnsNoun: string;
}

const months = (m: number) => (m % 12 === 0 && m >= 12 ? `${m / 12}-year` : `${m}-month`);

export const VOCAB: Record<DealKind, Vocab> = {
  goods: {
    totalSuffix: "delivered",
    priceSuffix: "",
    delivery: (d, x) => `${d}-day${x ? " express" : ""} delivery`,
    deliveryNoun: "Delivery terms",
    fees: (c) => (c ? `${formatMoney(c)} shipping` : "free shipping"),
    feesNoun: "Shipping",
    freeFeesAsk: "free shipping",
    fasterAsk: "express delivery",
    warranty: (m) => `${m}-month warranty`,
    returns: (d) => `${d}-day returns`,
    returnsNoun: "Return policy",
  },
  property: {
    totalSuffix: "incl. closing fees",
    priceSuffix: "",
    delivery: (d, x) => `possession in ${d} days${x ? " (fast-tracked)" : ""}`,
    deliveryNoun: "Possession",
    fees: (c) => (c ? `${formatMoney(c)} closing fees` : "seller pays closing fees"),
    feesNoun: "Closing fees",
    freeFeesAsk: "the seller covering closing fees",
    fasterAsk: "earlier possession",
    warranty: () => null,
    returns: (d) => `${d}-day cancellation window`,
    returnsNoun: "Cancellation",
  },
  rental: {
    totalSuffix: "for the first month, incl. fees",
    priceSuffix: "/month",
    delivery: (d, x) => `move in within ${d} days${x ? " (early move-in)" : ""}`,
    deliveryNoun: "Move-in",
    fees: (c) => (c ? `${formatMoney(c)} broker fee` : "no broker fee"),
    feesNoun: "Broker fee",
    freeFeesAsk: "no broker fee",
    fasterAsk: "an earlier move-in",
    warranty: () => null,
    returns: (d) => `${d}-day cancellation window`,
    returnsNoun: "Cancellation",
  },
  vehicle: {
    totalSuffix: "on the road",
    priceSuffix: "",
    delivery: (d, x) => `delivery in ${d} days${x ? " (priority)" : ""}`,
    deliveryNoun: "Delivery",
    fees: (c) => (c ? `${formatMoney(c)} destination fee` : "no destination fee"),
    feesNoun: "Destination fee",
    freeFeesAsk: "no destination fee",
    fasterAsk: "priority delivery",
    warranty: (m) => (m > 0 ? `${months(m)} warranty` : null),
    returns: (d) => `${d}-day return window`,
    returnsNoun: "Return window",
  },
};

export const vocabFor = (category: Category) => VOCAB[dealKind(category)];

/**
 * The refundable booking token PayPal takes for big-ticket and rental deals;
 * the rest is settled with the seller at closing, outside this app.
 * - House or land: 1% of the price, at least $1,000 and at most $5,000.
 * - Rental: half a month's rent.
 * - Car: a flat $500.
 */
export function bookingToken(category: Category, dealTotalCents: Cents): { tokenCents: Cents; rule: string } | null {
  const total = Math.max(0, Math.round(dealTotalCents));
  switch (dealKind(category)) {
    case "property": {
      const token = Math.min(dollars(5_000), Math.max(dollars(1_000), Math.round(total / 100 / 100) * 100));
      return { tokenCents: Math.min(token, total), rule: "1% of the price (at least $1,000, at most $5,000), refundable" };
    }
    case "rental":
      return { tokenCents: Math.min(total, Math.round(total / 2 / 100) * 100), rule: "half a month’s rent, refundable" };
    case "vehicle":
      return { tokenCents: Math.min(total, dollars(500)), rule: "a flat $500, refundable" };
    default:
      return null;
  }
}

/** Offer terms in words for this kind of deal; warranty is null when it doesn't apply. */
export function termText(category: Category, t: { deliveryDays: number; express: boolean; shippingCents: Cents; warrantyMonths: number; returnDays: number }) {
  const v = vocabFor(category);
  return {
    delivery: v.delivery(t.deliveryDays, t.express),
    fees: v.fees(t.shippingCents),
    warranty: t.warrantyMonths > 0 ? v.warranty(t.warrantyMonths) : null,
    returns: v.returns(t.returnDays),
    v,
  };
}

export const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
