/**
 * Monthly money plan: split take-home pay between bills, savings goals and
 * free spending, and track the month's spending. Pure functions, safe for the
 * browser. A planning tool with transparent arithmetic, not financial advice.
 */

export type Priority = "high" | "medium" | "low";

export type BucketKind = "need" | "want";

/** A part of the monthly split: rent, food, personal spending… */
export interface BudgetItem {
  id: string;
  name: string;
  amountCents: number;
  /** Share of take-home pay (0.3 = 30%). When set, the amount follows the pay. */
  pct?: number | null;
  /** Needs are must-pays; wants are personal or fun spending. Older plans default to need. */
  kind?: BucketKind;
  /** Category group, e.g. "Housing", "Food and groceries", "Entertainment". */
  group?: string;
  /** How the amount was entered; amountCents is always the monthly equivalent. */
  frequency?: "monthly" | "weekly";
  /** Amount as the user typed it, per `frequency`. */
  enteredCents?: number;
  /** Fixed (same every month, e.g. rent) or variable (e.g. groceries). */
  fixed?: boolean;
  /** For lifestyle categories: a limit the user chose, below the suggestion. Spending it all is never required. */
  limitCents?: number | null;
  /**
   * Auto-pay: on this day each month the payment is recorded in the plan
   * automatically. It never moves money from a bank account.
   */
  autoPay?: { day: number; lastMonth?: string | null } | null;
  /**
   * A monthly payment the user added (electricity, Netflix, a gym…). When it
   * was taken out of a broader category, that category shrank by movedCents,
   * which is given back if the payment is removed.
   */
  recurring?: { fromBillId: string | null; movedCents: number } | null;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  /** Month the goal should be reached by, "YYYY-MM". */
  dueMonth: string;
  priority: Priority;
  /** Set when the goal is a product from the catalogue. */
  productId?: string | null;
  /** Savings vault: when contributions start ("YYYY-MM") and the lock-in length (6–60 months). */
  startMonth?: string | null;
  lockMonths?: number | null;
  /** Virtual contribution ledger. Never a record of real money moving. */
  contributions?: Contribution[];
  /** Paused goals get no monthly contribution until resumed. */
  paused?: boolean;
  /** A monthly amount the user chose instead of the calculated one. */
  chosenMonthlyCents?: number | null;
  withdrawal?: Withdrawal | null;
  /**
   * Auto-save for locked goals: on this day each month the planned amount is
   * recorded into the plan automatically. Missing = on (the 1st); null = off.
   * It never moves money from a bank account.
   */
  autoSave?: { day: number; lastMonth?: string | null } | null;
  /** A pre-approved monthly auto-debit (e-mandate) for this locked fund. Simulated until a licensed partner is connected. */
  mandate?: Mandate | null;
  /** Step-up: each payment grows by `pct` every month (or year). Missing = 5% a month for locked funds; null = off. */
  stepUp?: StepUp | null;
}

export interface StepUp {
  /** 0.05 = 5%. */
  pct: number;
  every: "month" | "year";
}

/**
 * An e-mandate the user approved for a locked fund, shaped on RBI's
 * Digital Payments – E-mandate Framework, 2026: fixed amount, monthly date,
 * end date, a pre-debit notice 24 hours before each debit, and skip or cancel
 * at any time. `simulated: true` until a licensed bank partner runs it.
 */
export interface Mandate {
  /** Mandate reference shown to the user and in every notice. */
  ref: string;
  status: "active" | "cancelled" | "completed";
  rail: "upi-autopay" | "e-nach";
  amountCents: number;
  /** Day of the month the debit runs (1–28). */
  day: number;
  /** First month with a debit, "YYYY-MM". */
  startMonth: string;
  /** Last day a debit can run: the fund's maturity date, "YYYY-MM-DD". */
  endDate: string;
  /** When the user approved it (ISO time) and which terms they saw. */
  consentAt: string;
  termsVersion: string;
  /** Months the user opted out of. */
  skipMonths: string[];
  debits: MandateDebit[];
  cancelledAt?: string | null;
  simulated: true;
}

export interface MandateDebit {
  month: string;
  /** "YYYY-MM-DD" */
  date: string;
  amountCents: number;
  status: "debited" | "skipped";
}

export interface Contribution {
  /** Idempotency key: scheduled contributions use `${goalId}:${month}`, so the same month can't be recorded twice. */
  id: string;
  month: string;
  /** "YYYY-MM-DD" */
  date: string;
  amountCents: number;
  kind: "scheduled" | "extra";
  /** Virtual: tracked in this plan only. No financial provider holds this money. */
  virtual: true;
}

export interface Withdrawal {
  requestedAt: string;
  early: boolean;
  /** The balance when the withdrawal was requested. */
  amountCents: number;
  /** Early-withdrawal wallet charge (7% of the balance); 0 at or after maturity. */
  feeCents?: number;
  /** What the customer receives: balance minus the charge. */
  payoutCents?: number;
  status: "requested" | "completed";
}

/** Breaking a lock-in before maturity costs a wallet charge of 7% of the current balance. */
export const EARLY_WITHDRAWAL_FEE = 0.07;

/** The charge and payout for withdrawing a locked fund now. No charge at or after maturity. Whole units, rounded down in the customer's favour. */
export function withdrawalQuote(balanceCents: number, early: boolean): { feeCents: number; payoutCents: number } {
  const balance = Math.max(0, Math.round(balanceCents) || 0);
  const feeCents = early ? Math.floor((balance * EARLY_WITHDRAWAL_FEE) / 100) * 100 : 0;
  return { feeCents, payoutCents: balance - feeCents };
}

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

export interface Profile {
  employment?: "employed" | "self-employed" | "business" | "freelance" | "not-working" | null;
  maritalStatus?: "single" | "married" | null;
  livingWith?: "alone" | "family" | null;
  home?: "rent" | "own" | "family" | null;
  householdSize?: number | null;
  children?: number | null;
  childAges?: Array<"under-5" | "5-12" | "13-18" | "18+">;
  supportsParents?: boolean | null;
  otherDependents?: number | null;
  partnerEarns?: boolean | null;
}

export interface IncomeSource {
  id: string;
  kind: "salary" | "partner" | "other" | "variable" | "bonus";
  label: string;
  /** Monthly take-home. For bonus, the expected yearly amount (not used for the monthly split). */
  amountCents: number;
  /** Business or freelance: money coming in before costs (never counted as personal income). */
  grossCents?: number;
  /** Business or freelance: operating costs and tax set aside each month. */
  costsCents?: number;
}

export interface EmergencyFund {
  /** Months of essential expenses to cover (3 or 6 by default). */
  targetMonths: number;
  savedCents: number;
  /** Planned monthly contribution. */
  monthlyCents: number;
}

/** Where a spend came from: one of the bills (its id) or free spending. */
export type SpendSource = { kind: "bill"; billId: string } | { kind: "free" };

export interface Expense {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amountCents: number;
  note: string;
  source: SpendSource;
}

export interface GoalReserve {
  savedCents: number;
  /** In: the month's leftover share (id `reserve:<month>`). Out (negative): moved into a goal. */
  entries: Array<{ id: string; month: string; date: string; amountCents: number; goalId?: string | null }>;
}

export interface MoneyPlan {
  v: 1;
  /** Total monthly take-home income used for the split (household total when income sources are listed). */
  salaryCents: number;
  bills: BudgetItem[];
  goals: Goal[];
  expenses: Expense[];
  currency?: CurrencyCode;
  profile?: Profile;
  incomes?: IncomeSource[];
  /** Kept separate from goals: only this counts as the emergency fund. */
  emergency?: EmergencyFund | null;
  /** The part of the mandatory 10% for goals that goals didn't need yet: kept for goals (virtual). */
  goalReserve?: GoalReserve | null;
  /** Spending auto-detect: shops the user sorted themselves, shop key → category (bill) id. */
  merchantRules?: Record<string, string>;
}

export const EMPTY_PLAN: MoneyPlan = { v: 1, salaryCents: 0, bills: [], goals: [], expenses: [] };

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// ---------------------------------------------------------------- simple percentage split

export interface Source {
  label: string;
  url: string;
}

export const SOURCES = {
  payYourselfFirst: { label: "Thrivent", url: "https://www.thrivent.com/insights/budgeting-saving/types-of-budgets-5-most-popular-methods-examples-who-theyre-best-for" },
  zeroBased: { label: "Ramsey Solutions", url: "https://www.ramseysolutions.com/budgeting/budgeting-methods" },
  emergency: { label: "Capital One", url: "https://www.capitalone.com/learn-grow/money-management/how-to-build-and-use-emergency-funds/" },
  emergencyCfpb: { label: "Experian on CFPB guidance", url: "https://www.experian.com/blogs/ask-experian/do-you-really-need-to-save-three-to-six-months-worth-of-expenses" },
  housing: { label: "HUD USER", url: "https://huduser.gov/portal/node/5796" },
} satisfies Record<string, Source>;

const amountFor = (salary: number, pct: number) => Math.round((salary * pct) / 100) * 100;

let seq = 0;
const bucketId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Changing pay moves every percentage bucket with it. */
export function withSalary(plan: MoneyPlan, salaryCents: number): MoneyPlan {
  return { ...plan, salaryCents, bills: plan.bills.map((b) => (b.pct != null ? { ...b, amountCents: amountFor(salaryCents, b.pct) } : b)) };
}

export function setBucketPct(plan: MoneyPlan, id: string, pct: number): MoneyPlan {
  const p = Math.max(0, Math.min(1, pct));
  return { ...plan, bills: plan.bills.map((b) => (b.id === id ? { ...b, pct: p, amountCents: amountFor(plan.salaryCents, p) } : b)) };
}

export function setBucketAmount(plan: MoneyPlan, id: string, cents: number): MoneyPlan {
  return {
    ...plan,
    bills: plan.bills.map((b) => (b.id === id ? { ...b, amountCents: cents, pct: plan.salaryCents > 0 ? cents / plan.salaryCents : b.pct ?? null } : b)),
  };
}

export function addBucket(plan: MoneyPlan, name: string, kind: BucketKind, pct = 0.05): MoneyPlan {
  return { ...plan, bills: [...plan.bills, { id: bucketId(), name, kind, pct, amountCents: amountFor(plan.salaryCents, pct) }] };
}

export const bucketPct = (b: BudgetItem, salaryCents: number) => (b.pct != null ? b.pct : salaryCents > 0 ? b.amountCents / salaryCents : 0);

/** Needs, personal spending and what's left for savings, as amounts and shares of pay. */
export function splitByKind(plan: Pick<MoneyPlan, "salaryCents" | "bills">) {
  const needs = plan.bills.filter((b) => (b.kind ?? "need") === "need").reduce((s, b) => s + b.amountCents, 0);
  const wants = plan.bills.filter((b) => b.kind === "want").reduce((s, b) => s + b.amountCents, 0);
  const savings = Math.max(0, plan.salaryCents - needs - wants);
  const overBy = Math.max(0, needs + wants - plan.salaryCents);
  const share = (c: number) => (plan.salaryCents > 0 ? c / plan.salaryCents : 0);
  return { needs, wants, savings, overBy, needsPct: share(needs), wantsPct: share(wants), savingsPct: share(savings) };
}

// ---------------------------------------------------------------- months

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
export const addMonths = (key: string, n: number) => {
  const i = monthIndex(key) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

/** Monthly contributions left, counting this month: due this month → 1. Past due → 1. */
export function monthsLeft(dueMonth: string, now: string): number {
  return Math.max(1, monthIndex(dueMonth) - monthIndex(now) + 1);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---------------------------------------------------------------- plan

export type GoalStatus = "done" | "on-track" | "behind" | "cannot-start" | "paused";

/** Saved so far: the starting amount plus every recorded (virtual) contribution. */
export const goalSaved = (g: Goal) => g.savedCents + (g.contributions ?? []).reduce((s, c) => s + c.amountCents, 0);

export interface GoalPlan {
  goal: Goal;
  remainingCents: number;
  monthsLeft: number;
  /** What it takes each month to hit the date. */
  neededCents: number;
  /** What the plan can actually set aside each month. */
  monthlyCents: number;
  status: GoalStatus;
  /** When the goal will be reached at `monthlyCents` a month (null if it can't start). */
  reachMonth: string | null;
}

export interface MonthPlan {
  salaryCents: number;
  billsCents: number;
  /** Total paid into goals this month. */
  goalsCents: number;
  /**
   * The rest of the mandatory 10% for goals that the goals didn't need this
   * month: kept for goals in the Goals reserve, never moved elsewhere.
   */
  goalReserveCents: number;
  /** Set aside for the emergency fund this month (funded before goals). */
  emergencyCents: number;
  /** What's left to spend freely. Never negative. */
  freeCents: number;
  /** How much more a month the goals need than the plan can give (0 when everything fits). */
  shortfallCents: number;
  /** True when bills alone are more than the salary. */
  billsExceedSalary: boolean;
  goals: GoalPlan[];
}

/**
 * Splits the salary: bills first, then each goal's monthly need. If the money
 * runs out, goals are funded in order of priority, then earliest date, and any
 * goal that can't be fully funded gets a realistic new date.
 */
/**
 * The smallest monthly amount a locked savings plan accepts: ₹1,000 (10 in
 * other currencies). If less than that is left to save, the rest is enough.
 */
export const MIN_LOCK_MONTHLY: Record<CurrencyCode, number> = { INR: 1_000_00, USD: 10_00, EUR: 10_00, GBP: 10_00 };
export const minLockMonthly = (currency?: CurrencyCode) => MIN_LOCK_MONTHLY[currency ?? "INR"];

/** The default step-up for locked funds: each payment 5% bigger than the last, every month. */
export const DEFAULT_STEP_UP: StepUp = { pct: 0.05, every: "month" };

/** A goal's step-up: locked funds step up 5% a month unless switched off (null); other goals don't. */
export function stepUpOf(goal: Pick<Goal, "lockMonths" | "stepUp">): StepUp | null {
  if (!goal.lockMonths || goal.stepUp === null) return null;
  return goal.stepUp ?? DEFAULT_STEP_UP;
}

/**
 * Growth factor of each of the next `n` payments relative to this month's.
 * `offset` is how many months the plan has already run (for yearly steps).
 */
export function stepUpFactors(n: number, step: StepUp | null, offset = 0): number[] {
  const g = step ? step.pct : 0;
  return Array.from({ length: Math.max(1, n) }, (_, k) => (step?.every === "year" ? (1 + g) ** (Math.floor((offset + k) / 12) - Math.floor(offset / 12)) : (1 + g) ** k));
}

/**
 * This month's payment so that payments growing by the step-up add up to
 * exactly what's left by the end. Worked out again every month from what's
 * left, so if you're on track it is last month's payment plus 5%.
 */
export function stepUpFirst(remainingCents: number, n: number, step: StepUp | null, offset = 0): number {
  const sum = stepUpFactors(n, step, offset).reduce((t, f) => t + f, 0);
  return Math.ceil(Math.max(0, remainingCents) / sum / 100) * 100;
}

/** The planned payments for the rest of the plan (whole units), never more than what's left in total. */
export function stepUpSchedule(remainingCents: number, n: number, step: StepUp | null, offset = 0, minCents = 0): number[] {
  const first = Math.max(stepUpFirst(remainingCents, n, step, offset), Math.min(minCents, remainingCents));
  let left = Math.max(0, remainingCents);
  return stepUpFactors(n, step, offset).map((f) => {
    const pay = Math.min(left, Math.ceil((first * f) / 100) * 100);
    left -= pay;
    return pay;
  });
}

/**
 * How many months from this one until `startCents` is saved, paying `firstCents`
 * this month and growing by the step-up after that (as the plan does).
 */
export function monthsToSave(startCents: number, firstCents: number, step: StepUp | null, offset = 0): number {
  if (startCents <= 0) return 0;
  if (firstCents <= 0) return Infinity;
  let saved = 0;
  for (let k = 0; k < 1200; k++) {
    const f = step?.every === "year" ? (1 + step.pct) ** (Math.floor((offset + k) / 12) - Math.floor(offset / 12)) : step ? (1 + step.pct) ** k : 1;
    saved += Math.ceil((firstCents * f) / 100) * 100;
    if (saved >= startCents) return k + 1;
  }
  return 1200;
}

/** What was still left to save at the start of `month` (this month's contributions added back), so this month's amount doesn't shrink once it's paid. */
export function remainingAtStart(goal: Goal, month: string): number {
  const paidThisMonth = (goal.contributions ?? []).filter((c) => c.month === month).reduce((t, c) => t + c.amountCents, 0);
  return Math.max(0, goal.targetCents - goalSaved(goal) + paidThisMonth);
}

const monthsBetween = (from: string, to: string) => monthIndex(to) - monthIndex(from);

/** Monthly amount for a goal: locked plans never go below the minimum (unless less is left to save). */
export function lockedMonthly(goal: Pick<Goal, "lockMonths">, cents: number, remainingCents: number, currency?: CurrencyCode): number {
  if (!goal.lockMonths || remainingCents <= 0) return Math.min(cents, Math.max(0, remainingCents));
  return Math.min(remainingCents, Math.max(cents, minLockMonthly(currency)));
}

/** People living on this income, from the profile (older plans without a stored size are counted from what they have). */
export function householdSizeOf(profile?: Profile | null): number {
  if (!profile) return 1;
  const kids = profile.children ?? 0;
  return Math.max(1, profile.householdSize ?? kids + (profile.maritalStatus === "married" ? 2 : 1) + (profile.supportsParents ? 2 : 0));
}

/**
 * Emergency saving each month, by how many people depend on this income:
 * 7% of income for 1–2 people, 8% for 3–4, 9% for 5 or more.
 */
export function emergencyRate(familySize: number): number {
  return familySize >= 5 ? 0.09 : familySize >= 3 ? 0.08 : 0.07;
}

/**
 * What goes to the emergency fund this month: the user's amount, but never
 * below 7–9% of income while the fund isn't full (or while its size is still
 * unknown because no essentials are entered). Never more than it still needs.
 */
export function emergencyMonthly(plan: Pick<MoneyPlan, "salaryCents" | "bills" | "profile"> & { emergency?: EmergencyFund | null }): number {
  const e = plan.emergency;
  if (!e) return 0;
  const essentials = plan.bills.filter((b) => (b.kind ?? "need") === "need").reduce((s, b) => s + Math.max(0, b.amountCents), 0);
  const target = essentials * e.targetMonths;
  if (essentials > 0 && e.savedCents >= target) return 0;
  const floor = Math.floor((plan.salaryCents * emergencyRate(householdSizeOf(plan.profile))) / 100) * 100;
  const want = Math.max(Math.max(0, e.monthlyCents), floor);
  return essentials > 0 ? Math.min(want, target - e.savedCents) : want;
}

/** This share of monthly income always goes to goals (mandatory). */
export const GOAL_SHARE = 0.1;

/**
 * The mandatory monthly amount for goals: 10% of income. What the goals don't
 * need goes to the Goals reserve, so it's always kept for goals.
 */
export function goalFloor(salaryCents: number, _goals?: Goal[]): number {
  void _goals;
  return Math.floor((Math.max(0, salaryCents) * GOAL_SHARE) / 100) * 100;
}

/** Everything set aside for goals this month: payments into goals plus the Goals reserve. */
export const goalsShare = (m: Pick<MonthPlan, "goalsCents" | "goalReserveCents">) => m.goalsCents + (m.goalReserveCents ?? 0);

export function planMonth(plan: Pick<MoneyPlan, "salaryCents" | "bills" | "goals"> & { emergency?: EmergencyFund | null; currency?: CurrencyCode; profile?: Profile }, now: string): MonthPlan {
  const billsCents = plan.bills.reduce((s, b) => s + Math.max(0, b.amountCents), 0);
  let available = Math.max(0, plan.salaryCents - billsCents);
  // Protection comes before goals: the emergency contribution is funded first, never more than what's left.
  const emergencyCents = Math.min(available, emergencyMonthly(plan));
  available -= emergencyCents;

  const rows = plan.goals.map((goal) => {
    const remainingCents = Math.max(0, goal.targetCents - goalSaved(goal));
    const left = monthsLeft(goal.dueMonth, now);
    // This month's amount, from what was left at the start of the month (with any step-up).
    const start = remainingAtStart(goal, now);
    const base = stepUpFirst(start, left, stepUpOf(goal), goal.startMonth ? Math.max(0, monthsBetween(goal.startMonth, now)) : 0);
    return { goal, remainingCents, startCents: start, monthsLeft: left, neededCents: lockedMonthly(goal, base, start, plan.currency) };
  });

  const order = [...rows].sort(
    (a, b) => PRIORITY_RANK[a.goal.priority] - PRIORITY_RANK[b.goal.priority] || monthIndex(a.goal.dueMonth) - monthIndex(b.goal.dueMonth),
  );
  const monthly = new Map<string, number>();
  for (const r of order) {
    if (r.goal.paused) continue;
    const want = r.goal.chosenMonthlyCents != null ? lockedMonthly(r.goal, r.goal.chosenMonthlyCents, r.remainingCents, plan.currency) : r.neededCents;
    const give = Math.min(want, available);
    monthly.set(r.goal.id, give);
    available -= give;
  }
  // Goals get at least 10% of income each month: when they need less, the
  // difference goes to them (most important first) so they finish sooner.
  // Goals with a monthly amount the user chose keep their own amount.
  const floor = goalFloor(plan.salaryCents, plan.goals);
  let given = [...monthly.values()].reduce((t, x) => t + x, 0);
  for (const r of order) {
    if (given >= floor || available <= 0) break;
    if (r.goal.paused || r.goal.chosenMonthlyCents != null) continue;
    const current = monthly.get(r.goal.id) ?? 0;
    // Up to what the goal still needed at the start of this month (this month's payment included).
    const add = Math.min(r.startCents - current, floor - given, available);
    if (add <= 0) continue;
    monthly.set(r.goal.id, current + add);
    given += add;
    available -= add;
  }

  const goals: GoalPlan[] = rows.map(({ startCents, ...r }) => {
    const monthlyCents = monthly.get(r.goal.id) ?? 0;
    if (r.remainingCents === 0) return { ...r, monthlyCents: 0, status: "done", reachMonth: now };
    if (r.goal.paused) return { ...r, monthlyCents: 0, status: "paused", reachMonth: null };
    if (monthlyCents === 0) return { ...r, monthlyCents, status: "cannot-start", reachMonth: null };
    // Counted from the start of this month (a payment already made isn't counted again), with the step-up the
    // payments grow by, unless the customer chose a fixed amount.
    const step = r.goal.chosenMonthlyCents != null ? null : stepUpOf(r.goal);
    const offset = r.goal.startMonth ? Math.max(0, monthsBetween(r.goal.startMonth, now)) : 0;
    const months = monthsToSave(Math.max(r.remainingCents, startCents), monthlyCents, step, offset);
    const reachMonth = addMonths(now, months - 1);
    return { ...r, monthlyCents, status: monthlyCents >= r.neededCents ? "on-track" : "behind", reachMonth };
  });

  const goalsCents = goals.reduce((s, g) => s + g.monthlyCents, 0);
  // The rest of the mandatory 10% is kept for goals in the Goals reserve.
  const goalReserveCents = Math.max(0, Math.min(floor - given, available));
  const needed = rows.filter((r) => !r.goal.paused).reduce((s, r) => s + r.neededCents, 0);
  return {
    salaryCents: plan.salaryCents,
    billsCents,
    goalsCents,
    goalReserveCents,
    emergencyCents,
    freeCents: Math.max(0, plan.salaryCents - billsCents - emergencyCents - goalsCents - goalReserveCents),
    shortfallCents: Math.max(0, needed - goalsCents),
    billsExceedSalary: billsCents > plan.salaryCents,
    goals,
  };
}

// ---------------------------------------------------------------- this month

export interface Purchase {
  orderId: string;
  productId: string;
  productName: string;
  totalCents: number;
  /** ISO time the payment was captured. */
  paidAt: string;
}

export interface MonthSpending {
  /** Spent per bill id this month. */
  byBill: Map<string, number>;
  /** Logged free spending this month. */
  freeLoggedCents: number;
  /** AtoZAIx purchases this month that weren't bought for a goal (they count as free spending). */
  purchasesCents: number;
  /** AtoZAIx purchases matched to a product goal (paid from that goal's savings). */
  goalPurchases: Purchase[];
  freeSpentCents: number;
  freeLeftCents: number;
}

export function monthSpending(plan: MoneyPlan, month: MonthPlan, purchases: Purchase[], now: string): MonthSpending {
  const byBill = new Map<string, number>();
  let freeLoggedCents = 0;
  for (const e of plan.expenses) {
    if (!e.date.startsWith(now)) continue;
    if (e.source.kind === "bill") byBill.set(e.source.billId, (byBill.get(e.source.billId) ?? 0) + e.amountCents);
    else freeLoggedCents += e.amountCents;
  }
  const goalProducts = new Set(plan.goals.map((g) => g.productId).filter(Boolean));
  const thisMonth = purchases.filter((p) => p.paidAt.slice(0, 7) === now);
  const goalPurchases = thisMonth.filter((p) => goalProducts.has(p.productId));
  const purchasesCents = thisMonth.filter((p) => !goalProducts.has(p.productId)).reduce((s, p) => s + p.totalCents, 0);
  // App purchases come out of the first personal-spending bucket when there is one.
  const shopping = plan.bills.find((b) => b.kind === "want");
  if (shopping && purchasesCents) byBill.set(shopping.id, (byBill.get(shopping.id) ?? 0) + purchasesCents);
  const freeSpentCents = freeLoggedCents + (shopping ? 0 : purchasesCents);
  return { byBill, freeLoggedCents, purchasesCents, goalPurchases, freeSpentCents, freeLeftCents: month.freeCents - freeSpentCents };
}

// ---------------------------------------------------------------- storage

/** Accepts only a well-formed plan (from this device's storage); anything else becomes empty. */
export function parsePlan(raw: unknown): MoneyPlan {
  if (!raw || typeof raw !== "object") return EMPTY_PLAN;
  const r = raw as Partial<MoneyPlan>;
  const cents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);
  const str = (s: unknown, max = 80) => (typeof s === "string" ? s.slice(0, max) : "");
  const month = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}$/.test(s) ? s : null);
  const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return {
    v: 1,
    salaryCents: cents(r.salaryCents),
    bills: (Array.isArray(r.bills) ? r.bills : [])
      .map((b) => ({
        id: str(b?.id, 40),
        name: str(b?.name),
        amountCents: cents(b?.amountCents),
        pct: typeof b?.pct === "number" && b.pct >= 0 && b.pct <= 1 ? b.pct : null,
        kind: (b?.kind === "want" ? "want" : "need") as BucketKind,
        group: b?.group ? str(b.group, 40) : undefined,
        frequency: b?.frequency === "weekly" ? ("weekly" as const) : b?.frequency === "monthly" ? ("monthly" as const) : undefined,
        enteredCents: b?.enteredCents != null ? cents(b.enteredCents) : undefined,
        fixed: typeof b?.fixed === "boolean" ? b.fixed : undefined,
        limitCents: b?.limitCents != null ? cents(b.limitCents) : null,
        // null = switched off by the user; missing = never set (rent then defaults to on when the plan is next edited).
        autoPay:
          b?.autoPay && typeof b.autoPay === "object" && Number.isInteger(b.autoPay.day) && b.autoPay.day >= 1 && b.autoPay.day <= 28
            ? { day: b.autoPay.day, lastMonth: month(b.autoPay.lastMonth) }
            : b?.autoPay === undefined
              ? undefined
              : null,
        recurring:
          b?.recurring && typeof b.recurring === "object"
            ? { fromBillId: typeof b.recurring.fromBillId === "string" ? b.recurring.fromBillId.slice(0, 40) : null, movedCents: cents(b.recurring.movedCents) }
            : undefined,
      }))
      .filter((b) => b.id),
    goals: (Array.isArray(r.goals) ? r.goals : [])
      .map((g) => ({
        id: str(g?.id, 40),
        name: str(g?.name),
        targetCents: cents(g?.targetCents),
        savedCents: cents(g?.savedCents),
        dueMonth: month(g?.dueMonth) ?? "",
        priority: (["high", "medium", "low"] as const).includes(g?.priority as Priority) ? (g!.priority as Priority) : "medium",
        productId: typeof g?.productId === "string" ? g.productId.slice(0, 80) : null,
        startMonth: month(g?.startMonth),
        lockMonths: typeof g?.lockMonths === "number" && g.lockMonths >= 6 && g.lockMonths <= 60 ? Math.round(g.lockMonths) : null,
        paused: g?.paused === true,
        chosenMonthlyCents: g?.chosenMonthlyCents != null ? cents(g.chosenMonthlyCents) : null,
        autoSave:
          g?.autoSave && typeof g.autoSave === "object" && Number.isInteger(g.autoSave.day) && g.autoSave.day >= 1 && g.autoSave.day <= 28
            ? { day: g.autoSave.day, lastMonth: month(g.autoSave.lastMonth) }
            : g?.autoSave === null
              ? null
              : undefined,
        mandate: parseMandate(g?.mandate),
        stepUp:
          g?.stepUp && typeof g.stepUp === "object" && typeof g.stepUp.pct === "number" && g.stepUp.pct > 0 && g.stepUp.pct <= 0.2
            ? { pct: g.stepUp.pct, every: g.stepUp.every === "year" ? ("year" as const) : ("month" as const) }
            : g?.stepUp === null
              ? null
              : undefined,
        contributions: (Array.isArray(g?.contributions) ? g!.contributions : [])
          .map((c) => ({
            id: str(c?.id, 80),
            month: month(c?.month) ?? "",
            date: day(c?.date) ?? "",
            amountCents: cents(c?.amountCents),
            kind: c?.kind === "extra" ? ("extra" as const) : ("scheduled" as const),
            virtual: true as const,
          }))
          .filter((c, i, all) => c.id && c.month && c.date && c.amountCents > 0 && all.findIndex((x) => x.id === c.id) === i),
        withdrawal:
          g?.withdrawal && typeof g.withdrawal.requestedAt === "string"
            ? {
                requestedAt: str(g.withdrawal.requestedAt, 40),
                early: g.withdrawal.early === true,
                amountCents: cents(g.withdrawal.amountCents),
                ...(g.withdrawal.feeCents != null ? { feeCents: cents(g.withdrawal.feeCents) } : {}),
                ...(g.withdrawal.payoutCents != null ? { payoutCents: cents(g.withdrawal.payoutCents) } : {}),
                status: g.withdrawal.status === "completed" ? ("completed" as const) : ("requested" as const),
              }
            : null,
      }))
      .filter((g) => g.id && g.dueMonth),
    expenses: (Array.isArray(r.expenses) ? r.expenses : [])
      .map((e) => ({
        id: str(e?.id, 40),
        date: day(e?.date) ?? "",
        amountCents: cents(e?.amountCents),
        note: str(e?.note, 120),
        source: (e?.source && e.source.kind === "bill" && typeof e.source.billId === "string" ? { kind: "bill", billId: e.source.billId.slice(0, 40) } : { kind: "free" }) as SpendSource,
      }))
      .filter((e) => e.id && e.date),
    currency: (["INR", "USD", "EUR", "GBP"] as const).includes(r.currency as CurrencyCode) ? (r.currency as CurrencyCode) : undefined,
    goalReserve:
      r.goalReserve && typeof r.goalReserve === "object"
        ? {
            savedCents: cents(r.goalReserve.savedCents),
            entries: (Array.isArray(r.goalReserve.entries) ? r.goalReserve.entries : [])
              .map((e) => ({
                id: str(e?.id, 60),
                month: month(e?.month) ?? "",
                date: day(e?.date) ?? "",
                amountCents: typeof e?.amountCents === "number" && Number.isFinite(e.amountCents) ? Math.round(e.amountCents) : 0,
                ...(typeof e?.goalId === "string" ? { goalId: e.goalId.slice(0, 40) } : {}),
              }))
              .filter((e) => e.id && e.month && e.date)
              .slice(-240),
          }
        : undefined,
    merchantRules:
      r.merchantRules && typeof r.merchantRules === "object"
        ? Object.fromEntries(
            Object.entries(r.merchantRules as Record<string, unknown>)
              .filter(([k, v]) => /^[a-z0-9]{2,24}$/.test(k) && typeof v === "string")
              .slice(0, 300)
              .map(([k, v]) => [k, (v as string).slice(0, 40)]),
          )
        : undefined,
    profile: r.profile && typeof r.profile === "object" ? parseProfile(r.profile) : undefined,
    incomes: Array.isArray(r.incomes)
      ? r.incomes
          .map((i) => ({
            id: str(i?.id, 40),
            kind: (["salary", "partner", "other", "variable", "bonus"] as const).includes(i?.kind) ? i.kind : ("other" as const),
            label: str(i?.label),
            amountCents: cents(i?.amountCents),
            ...(i?.grossCents != null ? { grossCents: cents(i.grossCents) } : {}),
            ...(i?.costsCents != null ? { costsCents: cents(i.costsCents) } : {}),
          }))
          .filter((i) => i.id)
      : undefined,
    emergency:
      r.emergency && typeof r.emergency === "object"
        ? {
            targetMonths: Math.min(12, Math.max(1, Math.round(Number(r.emergency.targetMonths) || 3))),
            savedCents: cents(r.emergency.savedCents),
            monthlyCents: cents(r.emergency.monthlyCents),
          }
        : null,
  };
}

function parseMandate(m: unknown): Mandate | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Partial<Mandate>;
  const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
  const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const amount = typeof r.amountCents === "number" && Number.isFinite(r.amountCents) && r.amountCents > 0 ? Math.round(r.amountCents) : 0;
  if (typeof r.ref !== "string" || !r.ref || !amount || !Number.isInteger(r.day) || r.day! < 1 || r.day! > 28 || !isMonth(r.startMonth) || !isDay(r.endDate)) return null;
  return {
    ref: r.ref.slice(0, 40),
    status: r.status === "cancelled" || r.status === "completed" ? r.status : "active",
    rail: r.rail === "e-nach" ? "e-nach" : "upi-autopay",
    amountCents: amount,
    day: r.day!,
    startMonth: r.startMonth,
    endDate: r.endDate,
    consentAt: typeof r.consentAt === "string" ? r.consentAt.slice(0, 40) : "",
    termsVersion: typeof r.termsVersion === "string" ? r.termsVersion.slice(0, 40) : "",
    skipMonths: Array.isArray(r.skipMonths) ? r.skipMonths.filter(isMonth).slice(0, 120) : [],
    debits: (Array.isArray(r.debits) ? r.debits : [])
      .filter((d) => d && isMonth(d.month) && isDay(d.date) && typeof d.amountCents === "number" && d.amountCents >= 0)
      .map((d) => ({ month: d.month, date: d.date, amountCents: Math.round(d.amountCents), status: d.status === "skipped" ? ("skipped" as const) : ("debited" as const) }))
      .slice(0, 120),
    cancelledAt: typeof r.cancelledAt === "string" ? r.cancelledAt.slice(0, 40) : null,
    simulated: true,
  };
}

function parseProfile(p: Profile): Profile {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : null);
  const count = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  return {
    employment: pick(p.employment, ["employed", "self-employed", "business", "freelance", "not-working"] as const),
    maritalStatus: pick(p.maritalStatus, ["single", "married"] as const),
    livingWith: pick(p.livingWith, ["alone", "family"] as const),
    home: pick(p.home, ["rent", "own", "family"] as const),
    householdSize: count(p.householdSize, 30),
    children: count(p.children, 15),
    childAges: Array.isArray(p.childAges) ? p.childAges.filter((a) => ["under-5", "5-12", "13-18", "18+"].includes(a)).slice(0, 15) : [],
    supportsParents: bool(p.supportsParents),
    otherDependents: count(p.otherDependents, 20),
    partnerEarns: bool(p.partnerEarns),
  };
}

// ---------------------------------------------------------------- daily allowance

export interface Allowance {
  monthCents: number;
  dayCents: number;
  weekCents: number;
  spentCents: number;
  /** What's left per remaining day, including today. */
  leftPerDayCents: number;
  daysLeft: number;
}

/** Personal spending money as a daily and weekly limit (the envelope idea, without cash). */
export function allowance(plan: MoneyPlan, spending: MonthSpending, day: number, daysInMonth: number): Allowance | null {
  const wants = plan.bills.filter((b) => b.kind === "want");
  const monthCents = wants.reduce((s, b) => s + b.amountCents, 0);
  if (monthCents <= 0) return null;
  const spentCents = wants.reduce((s, b) => s + (spending.byBill.get(b.id) ?? 0), 0) + spending.freeLoggedCents;
  const daysLeft = Math.max(1, daysInMonth - day + 1);
  return {
    monthCents,
    // Whole currency units, rounded down so following the limit never overspends.
    dayCents: Math.floor(monthCents / daysInMonth / 100) * 100,
    weekCents: Math.floor(((monthCents / daysInMonth) * 7) / 100) * 100,
    spentCents,
    leftPerDayCents: Math.max(0, Math.floor((monthCents - spentCents) / daysLeft / 100) * 100),
    daysLeft,
  };
}

// ---------------------------------------------------------------- money guide

export interface GuideStep {
  id: string;
  title: string;
  why: string;
  done: boolean | null;
  source?: Source;
}

/** A step-by-step money routine, ticked off from the plan itself. `done: null` means "not something we can check". */
export function moneyGuide(plan: MoneyPlan, month: MonthPlan): GuideStep[] {
  const split = splitByKind(plan);
  const has = plan.salaryCents > 0;
  const rent = plan.bills.filter((b) => /rent|mortgage|housing/i.test(b.name)).reduce((s, b) => s + b.amountCents, 0);
  const emergency = plan.goals.filter((g) => /emergenc|rainy|safety|buffer|cushion/i.test(g.name));
  const coverMonths = split.needs > 0 ? emergency.reduce((s, g) => s + g.savedCents, 0) / split.needs : 0;
  return [
    { id: "pay", title: "Know your take-home pay", why: "Plan with what actually reaches your account, not your salary before tax.", done: has },
    {
      id: "every-dollar",
      title: "Give every dollar a job",
      why: "Zero-based budgeting: needs, personal spending and savings add up to exactly your pay, so nothing leaks.",
      done: has && plan.bills.length > 0 && split.overBy === 0,
      source: SOURCES.zeroBased,
    },
    {
      id: "pay-first",
      title: "Save what your goals need, first",
      why: "On payday, move what your goals and emergency fund need before you spend, so saving isn’t just what’s left over.",
      done: has && (plan.goals.length > 0 || Boolean(plan.emergency)) ? month.shortfallCents === 0 && split.overBy === 0 : false,
      source: SOURCES.payYourselfFirst,
    },
    {
      id: "housing",
      title: "Keep housing affordable",
      why: "HUD counts a household as cost-burdened above 30% of income before tax. On take-home pay, aim lower.",
      done: has && rent > 0 ? rent / plan.salaryCents <= 0.3 : null,
      source: SOURCES.housing,
    },
    {
      id: "emergency",
      title: "Build an emergency fund of 3 to 6 months of needs",
      why: "The common rule of thumb. The CFPB itself suggests sizing it to the surprises you’ve actually had.",
      done: emergency.length ? coverMonths >= 3 : false,
      source: SOURCES.emergency,
    },
    { id: "goals", title: "Turn big purchases into dated goals", why: "A target and a date turn into a fixed monthly amount you can plan around.", done: plan.goals.length > 0 },
    {
      id: "on-time",
      title: "Keep every goal on time",
      why: "If savings can’t cover every goal, give one more time or lower another part of your pay.",
      done: month.goals.length ? month.goals.every((g) => g.status === "done" || g.status === "on-track") : null,
    },
    { id: "daily", title: "Use a daily limit for personal money", why: "The envelope idea: a fixed amount per day or week makes overspending obvious early.", done: split.wants > 0, source: SOURCES.zeroBased },
    { id: "track", title: "Log spending each week", why: "Small, regular check-ins catch problems while there’s still time in the month.", done: plan.expenses.length > 0 },
    { id: "review", title: "Review when your pay or rent changes", why: "Percentages move with your pay automatically; check your goals and limits still fit.", done: null },
  ];
}
