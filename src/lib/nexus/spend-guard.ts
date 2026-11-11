/**
 * Spend Guard: before you approve a purchase, it's checked against your own
 * Money plan, so an AI agent can't spend past what you planned. Pure and
 * deterministic; runs in the browser, where the plan lives.
 *
 * - A product you're saving for is paid from that goal's fund.
 * - Anything else must fit what's left of your ENJOY limits this month.
 * - If it doesn't fit, approval stays locked until you choose to go over.
 * - Bookings (house, land, car): the refundable token is paid from your House
 *   or Car fund when you have one; a rental's monthly rent is checked against
 *   the Rent amount in your plan.
 */
import { goalSaved, monthKey, monthSpending, planMonth, type CurrencyCode, type MoneyPlan, type Purchase } from "./budget";
import { limitOf } from "./household";

/**
 * Approximate value of US$1 in each plan currency, for budgeting only (store
 * prices are in US dollars). Shown to the user as an estimate.
 */
export const REFERENCE_RATES: Record<CurrencyCode, number> = { USD: 1, INR: 88, EUR: 0.86, GBP: 0.75 };

export function toPlanCurrency(usdCents: number, currency: CurrencyCode = "USD"): number {
  return Math.round(Math.max(0, usdCents) * REFERENCE_RATES[currency]);
}

export interface PurchaseToCheck {
  productId: string;
  productName: string;
  /** Total in US cents (store currency): what PayPal charges now. */
  totalCents: number;
  /** Set for bookings: the full agreed price (and the monthly rent for rentals), in US cents. */
  booking?: { kind: "property" | "rental" | "vehicle"; dealTotalCents: number; monthlyCents?: number };
}

/** Goals that a booking can be paid from, by name, when no goal is tied to the exact listing. */
const GOAL_WORDS = { property: /\b(house|home|flat|apartment|land|plot|property)\b/i, vehicle: /\b(car|vehicle|suv)\b/i } as const;

interface Base {
  /** Price in the plan's currency. */
  priceCents: number;
  currency: CurrencyCode;
  /** True when the price was converted with an approximate rate. */
  estimated: boolean;
  rate: number;
  /** Bookings: the full agreed price in the plan's currency (settled with the seller later). */
  dealCents?: number;
}

export type SpendVerdict =
  | { kind: "no-plan" }
  | (Base & { kind: "goal"; fits: boolean; goalId: string; goalName: string; savedCents: number; shortCents: number; locked: boolean })
  | (Base & { kind: "rent"; fits: boolean; billName: string; rentCents: number; budgetCents: number; overCents: number })
  | (Base & {
      kind: "enjoy";
      fits: boolean;
      limitCents: number;
      spentCents: number;
      leftCents: number;
      /** What's left after this purchase (negative when over). */
      afterCents: number;
      overCents: number;
      /** Daily amount for the rest of the month after buying (0 when over). */
      perDayAfterCents: number;
      daysLeft: number;
      /** Goal funds with enough saved to cover it instead. */
      fundOptions: Array<{ goalId: string; name: string; savedCents: number }>;
      /** When the ENJOY budget starts again. */
      resetsOn: string;
    });

/** Approval needs your explicit "go over my plan" only when the purchase doesn't fit. */
export const needsOverride = (v: SpendVerdict) => v.kind !== "no-plan" && !v.fits;

export function checkPurchase(plan: MoneyPlan | null, item: PurchaseToCheck, purchases: Purchase[], today: Date = new Date()): SpendVerdict {
  if (!plan || plan.salaryCents <= 0) return { kind: "no-plan" };
  const currency = plan.currency ?? "USD";
  const b = item.booking;
  const base: Base = {
    priceCents: toPlanCurrency(item.totalCents, currency),
    currency,
    estimated: currency !== "USD",
    rate: REFERENCE_RATES[currency],
    ...(b ? { dealCents: toPlanCurrency(b.dealTotalCents, currency) } : {}),
  };

  // A rental: is the monthly rent within the Rent amount in your plan?
  if (b?.kind === "rental") {
    const bill = plan.bills.find((x) => x.kind === "need" && /\brent\b/i.test(x.name));
    if (bill) {
      const rentCents = toPlanCurrency(b.monthlyCents ?? b.dealTotalCents, currency);
      const budgetCents = limitOf(bill);
      return { ...base, kind: "rent", fits: rentCents <= budgetCents, billName: bill.name, rentCents, budgetCents, overCents: Math.max(0, rentCents - budgetCents) };
    }
  }

  // 1. Something you're saving for: paid from that goal's fund.
  const live = plan.goals.filter((g) => !g.withdrawal);
  const words = b && b.kind !== "rental" ? GOAL_WORDS[b.kind] : null;
  const goal = live.find((g) => g.productId === item.productId) ?? (words ? live.filter((g) => words.test(g.name)).sort((x, y) => goalSaved(y) - goalSaved(x))[0] : undefined);
  if (goal) {
    const saved = goalSaved(goal);
    const fits = saved >= base.priceCents;
    return { ...base, kind: "goal", fits, goalId: goal.id, goalName: goal.name, savedCents: saved, shortCents: Math.max(0, base.priceCents - saved), locked: Boolean(goal.lockMonths) };
  }

  // 2. Everything else: what's left of this month's ENJOY limits.
  const now = monthKey(today);
  const month = planMonth(plan, now);
  const usdToPlan = purchases.map((p) => ({ ...p, totalCents: toPlanCurrency(p.totalCents, currency) }));
  const spending = monthSpending(plan, month, usdToPlan, now);
  const wants = plan.bills.filter((b) => b.kind === "want");
  const limitCents = wants.reduce((t, b) => t + limitOf(b), 0);
  // App purchases are already counted in the first ENJOY category (or in free spending when there's none).
  const spentCents = wants.reduce((t, b) => t + (spending.byBill.get(b.id) ?? 0), 0) + spending.freeSpentCents;
  const leftCents = Math.max(0, limitCents - spentCents);
  const afterCents = leftCents - base.priceCents;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - today.getDate() + 1);
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return {
    ...base,
    kind: "enjoy",
    fits: afterCents >= 0,
    limitCents,
    spentCents,
    leftCents,
    afterCents,
    overCents: Math.max(0, -afterCents),
    perDayAfterCents: afterCents > 0 ? Math.floor(afterCents / daysLeft / 100) * 100 : 0,
    daysLeft,
    fundOptions: plan.goals
      .filter((g) => !g.withdrawal && goalSaved(g) >= base.priceCents)
      .map((g) => ({ goalId: g.id, name: g.name, savedCents: goalSaved(g) })),
    resetsOn: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
  };
}
