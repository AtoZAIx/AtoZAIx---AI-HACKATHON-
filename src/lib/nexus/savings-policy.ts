/**
 * LIVE · ENJOY · BUILD: the three-priority split.
 *
 * Deterministic and in whole currency units (amounts are in cents/paise and
 * rounded down to 100). Order, never the other way round:
 *   1. LIVE: the user's real essentials and EMIs, never reduced to hit a target.
 *   2. BUILD: aim to save 40% (preferred 35–45%), falling back to 30% where
 *      affordable, and never more than 50% of income.
 *   3. ENJOY: what's left for the person, kept at about 10% where possible
 *      and at most 25% (anything above that is left unassigned for the user to decide).
 */
import { planMonth, type MoneyPlan, type MonthPlan } from "./budget";
import { formatAmount, limitOf } from "./household";

export const SAVINGS_POLICY = {
  /** Preferred savings range. */
  preferredMin: 0.35,
  preferredMax: 0.45,
  /** What the plan aims for. */
  target: 0.4,
  /** Used when the preferred range doesn't fit. */
  fallback: 0.3,
  /** Never save more than this share of income. */
  ceiling: 0.5,
  /** ENJOY is kept at about this share when the target is reached. */
  enjoyComfort: 0.1,
  /** ENJOY never drops below this to reach the fallback. */
  enjoyMin: 0.05,
  /** ENJOY never gets more than this; the rest is left unassigned. */
  enjoyMax: 0.25,
} as const;

export type SavingsStatus = "preferred" | "fallback" | "below" | "none" | "shortfall";

export interface ThreePriorities {
  income: number;
  live: number;
  enjoy: number;
  build: number;
  /** Free money nobody has a job for yet (only when savings hit the preferred maximum and ENJOY its cap). */
  unassigned: number;
  /** How much essentials exceed income. */
  shortfall: number;
  /** BUILD ÷ income. */
  rate: number;
  status: SavingsStatus;
  /** Plain-language reason for the savings result. */
  explanation: string;
  targetCents: number;
  fallbackCents: number;
  ceilingCents: number;
}

const unit = (c: number) => Math.floor(c / 100) * 100;
const clean = (c: number) => (Number.isFinite(c) && c > 0 ? Math.round(c) : 0);
const pct = (f: number) => `${Math.round(f * 100)}%`;

export function savingsStatus(rate: number, shortfall = 0): SavingsStatus {
  if (shortfall > 0) return "shortfall";
  if (rate >= SAVINGS_POLICY.preferredMin - 1e-9) return "preferred";
  if (rate >= SAVINGS_POLICY.fallback - 1e-9) return "fallback";
  return rate > 0 ? "below" : "none";
}

function explain(r: Omit<ThreePriorities, "explanation">, currency: MoneyPlan["currency"]): string {
  const f = (c: number) => formatAmount(c, currency);
  switch (r.status) {
    case "shortfall":
      return `Your essentials are ${f(r.shortfall)} more than your income, so nothing can be saved yet. We won’t cut rent, food, medical costs, school fees or EMIs for you: review the biggest costs, look for extra income, or talk to your lender.`;
    case "preferred":
      return `You save ${pct(r.rate)} of your income (${f(r.build)} a month), inside the 35–45% we aim for.`;
    case "fallback":
      return `You save ${pct(r.rate)}. Your essentials take ${pct(r.live / r.income)} of income, so 35–40% would leave too little to live on; 30% or more is a solid result.`;
    case "below":
    case "none":
      return `After your essentials (${pct(r.live / Math.max(1, r.income))} of income), the most you can save while keeping a little for yourself is ${f(r.build)} (${pct(r.rate)}). That’s below the 30% fallback because of your real costs, not your choices. It rises as income grows or a cost ends.`;
  }
}

/** The recommended split for a monthly income and the user's real essentials. */
export function allocateThreePriorities(incomeCents: number, liveCents: number, currency: MoneyPlan["currency"] = "INR"): ThreePriorities {
  const income = clean(incomeCents);
  const live = clean(liveCents);
  const P = SAVINGS_POLICY;
  const targetCents = unit(income * P.target);
  const fallbackCents = unit(income * P.fallback);
  const ceilingCents = unit(income * P.ceiling);
  const room = income - live;

  let build = 0;
  let enjoy = 0;
  let unassigned = 0;
  const shortfall = Math.max(0, -room);

  if (room > 0) {
    // Aim for 40% while keeping about 10% to enjoy.
    build = Math.min(targetCents, unit(room - income * P.enjoyComfort));
    // Can't reach 30% that way? Try 30%, keeping at least 5% to enjoy.
    if (build < fallbackCents) build = Math.min(fallbackCents, unit(room - income * P.enjoyMin));
    build = Math.max(0, build);
    enjoy = room - build;
    // Very low essentials: ENJOY is capped. Extra goes to savings up to 45%, then stays unassigned.
    const enjoyCap = unit(income * P.enjoyMax);
    if (enjoy > enjoyCap) {
      const toSavings = Math.max(0, Math.min(enjoy - enjoyCap, unit(income * P.preferredMax) - build));
      build += toSavings;
      enjoy -= toSavings;
      if (enjoy > enjoyCap) {
        unassigned = enjoy - enjoyCap;
        enjoy = enjoyCap;
      }
    }
  }

  const rate = income > 0 ? build / income : 0;
  const base = { income, live, enjoy, build, unassigned, shortfall, rate, status: savingsStatus(rate, shortfall), targetCents, fallbackCents, ceilingCents };
  return { ...base, explanation: income > 0 ? explain(base, currency) : "Add your monthly income to see your plan." };
}

// ---------------------------------------------------------------------------
// The same three priorities, read from a plan the user may have edited.
// ---------------------------------------------------------------------------

export interface PlanPriorities extends ThreePriorities {
  /** Planned emergency fund + goal contributions this month. */
  committed: number;
  /** Planned savings above the 50% ceiling (a warning, never forced). */
  overCeiling: number;
  /** Lower ENJOY by this much to reach 30% (0 when already there or when essentials make it impossible). */
  toFallback: number;
  /** Lower ENJOY by this much to reach 40%. */
  toTarget: number;
}

export function planPriorities(plan: MoneyPlan, month: MonthPlan = planMonth(plan, new Date().toISOString().slice(0, 7))): PlanPriorities {
  const income = clean(plan.salaryCents);
  const live = plan.bills.filter((b) => (b.kind ?? "need") === "need").reduce((s, b) => s + b.amountCents, 0);
  const enjoy = plan.bills.filter((b) => b.kind === "want").reduce((s, b) => s + limitOf(b), 0);
  const P = SAVINGS_POLICY;
  const remaining = income - live - enjoy;
  const committed = month.emergencyCents + month.goalsCents;
  const keep = Math.max(unit(income * P.preferredMax), Math.min(committed, unit(income * P.ceiling)));
  const build = Math.max(0, Math.min(remaining, keep));
  const unassigned = Math.max(0, remaining - build);
  const shortfall = Math.max(0, live - income);
  const rate = income > 0 ? build / income : 0;
  const status = savingsStatus(rate, shortfall);
  const targetCents = unit(income * P.target);
  const fallbackCents = unit(income * P.fallback);
  const gap = (goal: number) => (build >= goal ? 0 : income - live - goal >= 0 ? Math.min(enjoy, goal - build) : 0);
  const base = { income, live, enjoy, build, unassigned, shortfall, rate, status, targetCents, fallbackCents, ceilingCents: unit(income * P.ceiling) };
  let explanation = income > 0 ? explain(base, plan.currency) : "Add your monthly income to see your plan.";
  const toFallback = gap(fallbackCents);
  if ((status === "below" || status === "none") && toFallback > 0) {
    explanation = `You save ${pct(rate)}. Lowering your ENJOY limits by ${formatAmount(toFallback, plan.currency)} would bring savings to 30%.`;
  }
  return { ...base, explanation, committed, overCeiling: Math.max(0, committed - unit(income * P.ceiling)), toFallback, toTarget: gap(targetCents) };
}

// ---------------------------------------------------------------------------
// BUILD, split into separate virtual pots.
// ---------------------------------------------------------------------------

export interface BuildPot {
  key: "emergency" | "goals" | "health" | "children" | "retirement" | "flexible";
  label: string;
  cents: number;
}

/**
 * Emergency fund and goals take what they need first; the rest of BUILD is
 * split into a health reserve, children's education (15% per child, up to
 * 35%), retirement and a flexible reserve. Planning amounts only.
 */
export function buildPots(build: number, emergencyCents: number, goalsCents: number, children: number | boolean): BuildPot[] {
  const kids = typeof children === "boolean" ? (children ? 1 : 0) : Math.max(0, Math.round(children) || 0);
  const emergency = Math.min(clean(emergencyCents), build);
  const goals = Math.min(clean(goalsCents), build - emergency);
  const rest = Math.max(0, build - emergency - goals);
  const health = unit(rest * 0.15);
  // Children's education: 15% of the rest per child, up to 35%.
  const childrenPot = unit(rest * Math.min(0.35, 0.15 * kids));
  const retirement = unit(rest * 0.35);
  const flexible = rest - health - childrenPot - retirement;
  const pots: BuildPot[] = [
    { key: "emergency", label: "Emergency fund", cents: emergency },
    { key: "goals", label: "Your goals", cents: goals },
    { key: "health", label: "Health reserve", cents: health },
    { key: "children", label: kids > 1 ? `Children’s education (${kids} children)` : "Children’s education", cents: childrenPot },
    { key: "retirement", label: "Retirement", cents: retirement },
    { key: "flexible", label: "Flexible savings", cents: flexible },
  ];
  return pots.filter((p) => p.cents > 0 || p.key === "emergency");
}

export const POLICY_LINE = "Aim to save 35–45% · at least 30% where affordable · never above 50%";
