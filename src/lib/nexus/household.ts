/**
 * Personalised household money management on top of the Money Plan engine.
 * Pure, deterministic and browser-safe: every number shown to the user comes
 * from these functions, and nothing here moves real money. Savings "vaults"
 * are a virtual ledger only.
 */
import { allocateThreePriorities } from "./savings-policy";
import {
  addMonths,
  emergencyMonthly,
  remainingAtStart,
  stepUpFirst,
  stepUpOf,
  stepUpSchedule,
  type StepUp,
  emergencyRate,
  goalSaved,
  lockedMonthly,
  minLockMonthly,
  monthLabel,
  planMonth,
  withSalary,
  type BudgetItem,
  type BucketKind,
  type Contribution,
  type CurrencyCode,
  type Goal,
  type IncomeSource,
  type MoneyPlan,
  type MonthPlan,
  type MonthSpending,
  type Priority,
  type Profile,
} from "./budget";

// ---------------------------------------------------------------- currency

const LOCALE: Record<CurrencyCode, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB" };
export const CURRENCIES: Array<{ code: CurrencyCode; label: string }> = [
  { code: "INR", label: "Indian rupee (₹)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British pound (£)" },
];

/** ₹1,50,000 for INR (lakh grouping), $150,000 for USD. Whole units unless there are paise/cents. */
export function formatAmount(cents: number, currency: CurrencyCode = "USD"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export const currencySymbol = (c: CurrencyCode = "USD") => ({ INR: "₹", USD: "$", EUR: "€", GBP: "£" })[c];

// ---------------------------------------------------------------- income

export interface IncomeSummary {
  yours: number;
  partner: number;
  other: number;
  variable: number;
  /** Expected yearly bonus: shown, never used for the monthly split. */
  bonusYearly: number;
  /** Monthly take-home used for the plan (excludes bonus). */
  totalMonthly: number;
}

export function incomeSummary(plan: Pick<MoneyPlan, "incomes" | "salaryCents">): IncomeSummary {
  const list = plan.incomes ?? [];
  if (!list.length) return { yours: plan.salaryCents, partner: 0, other: 0, variable: 0, bonusYearly: 0, totalMonthly: plan.salaryCents };
  const sum = (k: IncomeSource["kind"]) => list.filter((i) => i.kind === k).reduce((s, i) => s + i.amountCents, 0);
  const s = { yours: sum("salary"), partner: sum("partner"), other: sum("other"), variable: sum("variable"), bonusYearly: sum("bonus") };
  return { ...s, totalMonthly: s.yours + s.partner + s.other + s.variable };
}

/** Sets income sources; the plan's monthly total becomes the household take-home (percentage parts move with it). */
export function setIncomes(plan: MoneyPlan, incomes: IncomeSource[]): MoneyPlan {
  const next = { ...plan, incomes };
  return withSalary(next, incomeSummary(next).totalMonthly);
}

// ---------------------------------------------------------------- categories

export interface CategoryGroup {
  group: string;
  kind: BucketKind;
  items: string[];
}

export const ESSENTIAL_GROUPS: CategoryGroup[] = [
  { group: "Housing", kind: "need", items: ["House rent", "Home loan EMI", "Maintenance", "Other property costs"] },
  { group: "Food and groceries", kind: "need", items: ["Monthly groceries", "Vegetables and fruits", "Milk and essentials", "Household supplies", "Drinking water"] },
  { group: "Transport", kind: "need", items: ["Public transport", "Fuel", "Vehicle EMI", "Vehicle maintenance", "Parking", "Other commuting"] },
  { group: "Utilities", kind: "need", items: ["Electricity", "Water", "Cooking gas", "Internet", "Mobile recharge", "Other household bills"] },
  { group: "Family and children", kind: "need", items: ["School fees", "College fees", "Tuition", "Books and stationery", "Childcare", "Other education"] },
  { group: "Healthcare", kind: "need", items: ["Health insurance", "Life insurance", "Medicines", "Doctor visits", "Regular medical costs"] },
  { group: "Loans and debt", kind: "need", items: ["Personal loan EMI", "Education loan EMI", "Credit card repayment", "Other debt repayment"] },
  { group: "Family support", kind: "need", items: ["Support for parents", "Other dependents", "Other necessary commitments"] },
];

export const LIFESTYLE_GROUPS: CategoryGroup[] = [
  { group: "Entertainment", kind: "want", items: ["Movies", "OTT subscriptions", "Gaming", "Events"] },
  { group: "Food and outings", kind: "want", items: ["Restaurants", "Cafes", "Food delivery", "Weekend outings"] },
  { group: "Shopping", kind: "want", items: ["Clothing", "Electronics", "Accessories", "Personal shopping"] },
  { group: "Lifestyle", kind: "want", items: ["Hobbies", "Fitness", "Personal care", "Sports", "Social activities"] },
  { group: "Travel", kind: "want", items: ["Short trips", "Weekend travel", "Holidays"] },
];

/** Weekly amounts become a monthly equivalent (52 weeks ÷ 12 months), rounded to a whole unit. */
export function monthlyFrom(enteredCents: number, frequency: "monthly" | "weekly"): number {
  return frequency === "weekly" ? Math.round((enteredCents * 52) / 12 / 100) * 100 : enteredCents;
}

let seq = 0;
const catId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Adds or updates one category by group + name. Real amounts only: nothing is estimated for you. */
export function setCategory(
  plan: MoneyPlan,
  c: { group: string; name: string; kind: BucketKind; enteredCents: number; frequency?: "monthly" | "weekly"; fixed?: boolean },
): MoneyPlan {
  const frequency = c.frequency ?? "monthly";
  const amountCents = monthlyFrom(c.enteredCents, frequency);
  const existing = plan.bills.find((b) => b.group === c.group && b.name === c.name);
  if (c.enteredCents <= 0) return existing ? { ...plan, bills: plan.bills.filter((b) => b !== existing) } : plan;
  const item: BudgetItem = { id: existing?.id ?? catId(), name: c.name, group: c.group, kind: c.kind, frequency, enteredCents: c.enteredCents, fixed: c.fixed ?? existing?.fixed, amountCents, pct: null, limitCents: existing?.limitCents ?? null, autoPay: existing?.autoPay };
  return { ...plan, bills: existing ? plan.bills.map((b) => (b === existing ? item : b)) : [...plan.bills, item] };
}

/** The monthly limit for a category: a lifestyle limit the user chose, otherwise its planned amount. */
export const limitOf = (b: BudgetItem) => (b.kind === "want" && b.limitCents != null ? b.limitCents : b.amountCents);

export interface LifestyleSuggestion {
  poolCents: number;
  byGroup: Record<string, number>;
  assumptions: string[];
}

/** Everyday treats get the most; shopping, entertainment and travel are kept small. */
const LIFESTYLE_WEIGHTS: Record<string, number> = { "Food and outings": 0.4, Shopping: 0.2, Lifestyle: 0.2, Entertainment: 0.1, Travel: 0.1 };



/** A small cushion kept unassigned for surprises: 5% of income. */
export const BUFFER_SHARE = 0.05;

export function suggestLifestyle(plan: MoneyPlan, now: string): LifestyleSuggestion {
  const t = personalTargets(plan, now);
  // ENJOY comes from the savings policy: essentials first, then aim to save 35–45% (at least 30%), never above 50%.
  const policy = allocateThreePriorities(t.income, t.essentials, plan.currency);
  const poolCents = Math.min(policy.enjoy, Math.floor(t.lifestyleSafe / 100) * 100);
  const byGroup = Object.fromEntries(Object.entries(LIFESTYLE_WEIGHTS).map(([g, w]) => [g, Math.floor((poolCents * w) / 100) * 100]));
  const f = (c: number) => formatAmount(c, plan.currency);
  return {
    poolCents,
    byGroup,
    assumptions: [
      `Worked out from your own numbers, not a fixed percentage: income ${f(t.income)} minus essentials ${f(t.essentials)}, your emergency fund ${f(t.emergencyNeed)} and goals ${f(t.goalsNeed)}, keeping ${f(t.buffer)} spare.`,
      `Savings come before spending: ${f(policy.build)} (${Math.round(policy.rate * 100)}%) is kept for BUILD, so ENJOY gets up to ${f(poolCents)}. Shopping, entertainment and travel are kept small.`,
      "Change any limit to suit you.",
    ],
  };
}

export interface PersonalTargets {
  income: number;
  essentials: number;
  /** Monthly amount your emergency fund needs: your chosen amount, or enough to finish in a year. */
  emergencyNeed: number;
  /** What your goals need each month to be on time. */
  goalsNeed: number;
  /** Emergency fund + goals: your own savings target. */
  savingsNeed: number;
  /** What you've actually planned for savings this month (emergency + goals). */
  savingsPlanned: number;
  buffer: number;
  /** Safe lifestyle spending after essentials, savings needs and the buffer. */
  lifestyleSafe: number;
  lifestylePlanned: number;
}

/**
 * Targets built from the user's own situation instead of fixed percentages:
 * essentials are what they really pay, savings are what their goals and
 * emergency fund need, lifestyle is what's safe after that and a small buffer.
 */
export function personalTargets(plan: MoneyPlan, now: string): PersonalTargets {
  const needs = plan.bills.filter((b) => (b.kind ?? "need") === "need");
  const essentials = needs.reduce((s, b) => s + b.amountCents, 0);
  const lifestylePlanned = plan.bills.filter((b) => b.kind === "want").reduce((s, b) => s + limitOf(b), 0);
  const m = planMonth({ ...plan, bills: needs }, now);
  const goalsNeed = m.goals.filter((g) => g.status !== "done" && g.status !== "paused").reduce((s, g) => s + g.neededCents, 0);
  const e = emergencyStatus(plan, now);
  const emergencyNeed = plan.emergency ? (plan.emergency.monthlyCents > 0 ? Math.min(plan.emergency.monthlyCents, e.remaining) : e.suggestedMonthly) : 0;
  const income = plan.salaryCents;
  const buffer = Math.floor((income * BUFFER_SHARE) / 100) * 100;
  const full = planMonth(plan, now);
  return {
    income,
    essentials,
    emergencyNeed,
    goalsNeed,
    savingsNeed: emergencyNeed + goalsNeed,
    savingsPlanned: full.emergencyCents + full.goalsCents,
    buffer,
    lifestyleSafe: Math.max(0, income - essentials - emergencyNeed - goalsNeed - buffer),
    lifestylePlanned,
  };
}

export interface TargetRow {
  key: "essentials" | "savings" | "lifestyle" | "buffer";
  label: string;
  yours: number;
  target: number;
  ok: boolean;
  note: string;
}

/** Plain-language check of the plan against the user's own targets. */
export function targetChecks(plan: MoneyPlan, now: string): TargetRow[] {
  const t = personalTargets(plan, now);
  const f = (c: number) => formatAmount(c, plan.currency);
  const reserve = Math.max(0, t.income - t.essentials - t.lifestylePlanned - t.savingsPlanned);
  const room = Math.max(0, t.income - t.essentials);
  return [
    {
      key: "essentials",
      label: "Essentials",
      yours: t.essentials,
      target: room >= t.savingsNeed ? t.essentials : Math.max(0, t.income - t.savingsNeed),
      ok: t.essentials <= t.income - t.savingsNeed,
      note:
        t.essentials > t.income
          ? `Your essentials are ${f(t.essentials - t.income)} more than your income.`
          : t.essentials <= t.income - t.savingsNeed
            ? `Your real costs of ${f(t.essentials)} leave room for everything you’re saving for.`
            : `After essentials, ${f(room)} is left but your goals and safety net need ${f(t.savingsNeed)}.`,
    },
    {
      key: "savings",
      label: "Savings for your goals and safety net",
      yours: t.savingsPlanned,
      target: t.savingsNeed,
      ok: t.savingsPlanned >= t.savingsNeed,
      note:
        t.savingsNeed === 0
          ? "Add a goal or an emergency fund to get a savings target."
          : t.savingsPlanned >= t.savingsNeed
            ? `${f(t.savingsPlanned)} a month covers what your goals and emergency fund need.`
            : `Your goals and emergency fund need ${f(t.savingsNeed)} a month; ${f(t.savingsPlanned)} is planned.`,
    },
    {
      key: "lifestyle",
      label: "Lifestyle spending",
      yours: t.lifestylePlanned,
      target: t.lifestyleSafe,
      ok: t.lifestylePlanned <= t.lifestyleSafe,
      note:
        t.lifestylePlanned <= t.lifestyleSafe
          ? `Your limits of ${f(t.lifestylePlanned)} are within the ${f(t.lifestyleSafe)} that’s safe for you.`
          : `Your limits are ${f(t.lifestylePlanned - t.lifestyleSafe)} above what’s safe; lowering them protects your savings.`,
    },
    {
      key: "buffer",
      label: "Spare money for surprises",
      yours: reserve,
      target: t.buffer,
      ok: reserve >= t.buffer,
      note: reserve >= t.buffer ? `${f(reserve)} a month is left unassigned for surprises.` : `Only ${f(reserve)} is left unassigned; about ${f(t.buffer)} gives you a cushion.`,
    },
  ];
}

// ---------------------------------------------------------------- allocation (A–E)

export interface Allocation {
  income: number;
  essentials: number;
  lifestyle: number;
  protection: number;
  goals: number;
  reserve: number;
  /** Essentials alone are more than income. */
  essentialsShortfall: number;
  /** Essentials + lifestyle are more than income (lifestyle must come down; essentials are never cut automatically). */
  overAllocated: number;
  explanations: string[];
}

export function allocation(plan: MoneyPlan, month: MonthPlan = planMonth(plan, nowMonth())): Allocation {
  const income = plan.salaryCents;
  const essentials = plan.bills.filter((b) => (b.kind ?? "need") === "need").reduce((s, b) => s + b.amountCents, 0);
  const lifestyle = plan.bills.filter((b) => b.kind === "want").reduce((s, b) => s + limitOf(b), 0);
  const essentialsShortfall = Math.max(0, essentials - income);
  const overAllocated = Math.max(0, essentials + lifestyle - income);
  const reserve = Math.max(0, income - essentials - lifestyle - month.emergencyCents - month.goalsCents);
  const explanations: string[] = [];
  if (essentialsShortfall > 0) {
    const biggest = plan.bills
      .filter((b) => (b.kind ?? "need") === "need")
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 3)
      .map((b) => b.name);
    explanations.push(
      `Your essentials are more than your income. We won’t cut rent, food, school, medical costs or loan payments for you. Review the biggest ones (${biggest.join(", ")}), look for extra income, or speak to your lender about EMIs.`,
    );
  } else if (overAllocated > 0) {
    explanations.push("Your lifestyle limits are more than what’s left after essentials. Lower some lifestyle limits; essentials stay as they are.");
  }
  return { income, essentials, lifestyle, protection: month.emergencyCents, goals: month.goalsCents, reserve, essentialsShortfall, overAllocated, explanations };
}

export function nowMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- category limits and alerts

export type AlertLevel = "fine" | "half" | "reminder" | "warning" | "exhausted" | "over";

export interface CategoryStatus {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  pctUsed: number;
  dayCents: number;
  weekCents: number;
  level: AlertLevel;
  message: string;
  action: string | null;
}

export const DEFAULT_THRESHOLDS = { half: 0.5, reminder: 0.75, warning: 0.9 };

export function categoryStatus(
  name: string,
  limitCents: number,
  spentCents: number,
  day: number,
  daysInMonth: number,
  currency: CurrencyCode = "USD",
  t = DEFAULT_THRESHOLDS,
): CategoryStatus {
  const f = (c: number) => formatAmount(c, currency);
  const remainingCents = limitCents - spentCents;
  const pctUsed = limitCents > 0 ? spentCents / limitCents : spentCents > 0 ? Infinity : 0;
  const daysLeft = Math.max(1, daysInMonth - day + 1);
  const dayCents = Math.max(0, Math.floor(remainingCents / daysLeft / 100) * 100);
  const weekCents = Math.max(0, Math.floor((remainingCents / daysLeft) * 7 / 100) * 100);
  let level: AlertLevel = "fine";
  if (pctUsed > 1) level = "over";
  else if (pctUsed >= 1) level = "exhausted";
  else if (pctUsed >= t.warning) level = "warning";
  else if (pctUsed >= t.reminder) level = "reminder";
  else if (pctUsed >= t.half) level = "half";
  const messages: Record<AlertLevel, [string, string | null]> = {
    fine: [`You have ${f(remainingCents)} left for ${name.toLowerCase()} this month.`, null],
    half: [`Half of your ${name.toLowerCase()} money is used. ${f(remainingCents)} is left.`, `About ${f(dayCents)} a day keeps you on track.`],
    reminder: [`75% of your ${name.toLowerCase()} money is used, with ${daysLeft} days to go.`, `Slow down to about ${f(dayCents)} a day.`],
    warning: [`90% of your ${name.toLowerCase()} money is used. Only ${f(remainingCents)} is left.`, "Hold off on non-urgent spending here until next month."],
    exhausted: [`Your ${name.toLowerCase()} money for this month is used up.`, "Anything more here will come out of savings or another part."],
    over: [
      `You’ve spent ${f(-remainingCents)} more than your ${name.toLowerCase()} limit.`,
      "That extra comes out of your reserve or savings. We won’t move money between parts for you: lower another limit or raise this one.",
    ],
  };
  return { limitCents, spentCents, remainingCents, pctUsed, dayCents, weekCents, level, message: messages[level][0], action: messages[level][1] };
}

export function categoryStatuses(plan: MoneyPlan, spending: MonthSpending, day: number, daysInMonth: number) {
  return plan.bills.map((b) => ({ item: b, status: categoryStatus(b.name, limitOf(b), spending.byBill.get(b.id) ?? 0, day, daysInMonth, plan.currency) }));
}

// ---------------------------------------------------------------- emergency fund

export interface EmergencyStatus {
  essentialsMonthly: number;
  target3: number;
  target6: number;
  targetMonths: number;
  target: number;
  saved: number;
  remaining: number;
  progress: number;
  /** Suggested to finish in 12 months. */
  suggestedMonthly: number;
  monthly: number;
  completionMonth: string | null;
}

export function emergencyStatus(plan: MoneyPlan, now: string): EmergencyStatus {
  const essentialsMonthly = plan.bills.filter((b) => (b.kind ?? "need") === "need").reduce((s, b) => s + b.amountCents, 0);
  const e = plan.emergency ?? { targetMonths: 3, savedCents: 0, monthlyCents: 0 };
  const target = essentialsMonthly * e.targetMonths;
  const remaining = Math.max(0, target - e.savedCents);
  const monthly = emergencyMonthly(plan);
  return {
    essentialsMonthly,
    target3: essentialsMonthly * 3,
    target6: essentialsMonthly * 6,
    targetMonths: e.targetMonths,
    target,
    saved: e.savedCents,
    remaining,
    progress: target > 0 ? Math.min(1, e.savedCents / target) : 0,
    suggestedMonthly: Math.ceil(remaining / 12 / 100) * 100,
    monthly,
    // No essentials entered yet: the target is unknown, so there's no finish date (not "done").
    completionMonth: essentialsMonthly === 0 ? null : remaining === 0 ? now : monthly > 0 ? addMonths(now, Math.ceil(remaining / monthly) - 1) : null,
  };
}

export function setEmergency(plan: MoneyPlan, e: Partial<NonNullable<MoneyPlan["emergency"]>>): MoneyPlan {
  const base = plan.emergency ?? { targetMonths: 3, savedCents: 0, monthlyCents: 0 };
  return { ...plan, emergency: { ...base, ...e } };
}

// ---------------------------------------------------------------- savings vaults

export const LOCK_OPTIONS = [6, 12, 24, 36, 48, 60] as const;
export const clampLock = (m: number) => Math.min(60, Math.max(6, Math.round(m)));

/** Calendar-aware: Jan 31 + 1 month → Feb 28 (or 29 in a leap year). */
export function addMonthsToDate(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

export interface VaultView {
  startMonth: string;
  lockMonths: number;
  /** Lock-in ends on this date (start of the start month + lock months). */
  maturityDate: string;
  maturityMonth: string;
  saved: number;
  remaining: number;
  /** Contribution months left, counting this one, up to maturity. */
  monthsLeft: number;
  requiredMonthly: number;
  totalExpected: number;
  /** Months of contributions until the target is saved (can be before maturity; the money stays locked until then). */
  monthsToFinish: number;
  completion: number;
  daysToMaturity: number;
  matured: boolean;
  /** Months since the start (before this one) with no contribution while active. */
  missedMonths: string[];
  contributedThisMonth: boolean;
  /** The step-up in use (null = flat payments). */
  stepUp: StepUp | null;
  /** Planned payments from this month to maturity, growing by the step-up. */
  schedule: number[];
  /** Smallest monthly amount a locked plan accepts (₹1,000). */
  minimumMonthly: number;
  /** What will be set aside by maturity from your own contributions. No interest is added. */
  maturityTotal: number;
}

export function vault(goal: Goal, now: string, today: string, currency?: CurrencyCode): VaultView {
  const startMonth = goal.startMonth ?? now;
  const lockMonths = clampLock(goal.lockMonths ?? 12);
  const maturityDate = addMonthsToDate(`${startMonth}-01`, lockMonths);
  const maturityMonth = maturityDate.slice(0, 7);
  const saved = goalSaved(goal);
  const remaining = Math.max(0, goal.targetCents - saved);
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
  const monthsLeft = Math.max(1, idx(maturityMonth) - Math.max(idx(now), idx(startMonth)));
  const min = minLockMonthly(currency);
  // At least the minimum each month (₹1,000), or whatever is left if that's less.
  // This month's amount, from what was left at the start of the month, growing by the step-up (5% a month by default).
  const start = remainingAtStart(goal, now);
  const step = stepUpOf(goal);
  const offset = Math.max(0, idx(now) - idx(startMonth));
  const requiredMonthly = lockedMonthly({ lockMonths }, stepUpFirst(start, monthsLeft, step, offset), start, currency);
  const schedule = stepUpSchedule(start, monthsLeft, step, offset, min);
  const monthly = goal.chosenMonthlyCents != null ? lockedMonthly({ lockMonths }, goal.chosenMonthlyCents, remaining, currency) : requiredMonthly;
  const months = new Set((goal.contributions ?? []).map((c) => c.month));
  const missedMonths: string[] = [];
  if (!goal.paused) for (let m = startMonth; idx(m) < idx(now); m = addMonths(m, 1)) if (!months.has(m)) missedMonths.push(m);
  return {
    startMonth,
    lockMonths,
    maturityDate,
    maturityMonth,
    saved,
    remaining,
    monthsLeft,
    requiredMonthly,
    // Never more than what's actually left to save (the minimum can finish a small goal early).
    totalExpected: Math.min(remaining, schedule.reduce((t, x) => t + x, 0)),
    monthsToFinish: Math.max(0, schedule.findIndex((_, i) => schedule.slice(0, i + 1).reduce((t, x) => t + x, 0) >= start) + 1),
    completion: goal.targetCents > 0 ? Math.min(1, saved / goal.targetCents) : 0,
    daysToMaturity: Math.max(0, daysBetween(today, maturityDate)),
    matured: daysBetween(today, maturityDate) <= 0,
    missedMonths,
    contributedThisMonth: months.has(now),
    minimumMonthly: min,
    stepUp: step,
    schedule,
    // Saved before this month + the planned payments from this month on (growing with the step-up, or your own flat amount).
    maturityTotal: Math.min(goal.targetCents, goal.targetCents - start + (goal.chosenMonthlyCents != null ? monthly * monthsLeft : schedule.reduce((t, x) => t + x, 0))),
  };
}

/** Creates a vault goal. Its due month is the maturity month. */
export function createVaultGoal(input: { id: string; name: string; targetCents: number; savedCents: number; lockMonths: number; priority: Priority; productId?: string | null; stepUp?: StepUp | null }, now: string): Goal {
  const lockMonths = clampLock(input.lockMonths);
  const maturity = addMonthsToDate(`${now}-01`, lockMonths).slice(0, 7);
  return { ...input, productId: input.productId ?? null, startMonth: now, lockMonths, dueMonth: addMonths(maturity, -1), contributions: [], paused: false, chosenMonthlyCents: null, withdrawal: null };
}

/**
 * Records a virtual contribution. Idempotent: a scheduled contribution's id is
 * `${goalId}:${month}`, and an extra one carries the caller's key, so a repeat
 * (double click, retry, replay) never creates a second record.
 */
export function recordContribution(
  plan: MoneyPlan,
  goalId: string,
  c: { month: string; date: string; amountCents: number; kind: Contribution["kind"]; key?: string },
): { plan: MoneyPlan; duplicate: boolean } {
  const goal = plan.goals.find((g) => g.id === goalId);
  if (!goal || c.amountCents <= 0) return { plan, duplicate: false };
  if (goal.withdrawal) return { plan, duplicate: false };
  const id = c.kind === "scheduled" ? `${goalId}:${c.month}` : `${goalId}:extra:${c.key ?? c.date}`;
  if ((goal.contributions ?? []).some((x) => x.id === id)) return { plan, duplicate: true };
  const entry: Contribution = { id, month: c.month, date: c.date, amountCents: c.amountCents, kind: c.kind, virtual: true };
  return { plan: { ...plan, goals: plan.goals.map((g) => (g.id === goalId ? { ...g, contributions: [...(g.contributions ?? []), entry] } : g)) }, duplicate: false };
}

export const setPaused = (plan: MoneyPlan, goalId: string, paused: boolean): MoneyPlan => ({ ...plan, goals: plan.goals.map((g) => (g.id === goalId ? { ...g, paused } : g)) });

/**
 * Sets a goal's monthly amount as typed. For locked plans the engine never
 * uses less than the minimum (₹1,000 a month); see lockedMonthly.
 */
export const setChosenMonthly = (plan: MoneyPlan, goalId: string, cents: number | null): MoneyPlan => ({
  ...plan,
  goals: plan.goals.map((g) => (g.id === goalId ? { ...g, chosenMonthlyCents: cents } : g)),
});

/** A withdrawal request. Before maturity it is marked early. Virtual: nothing is paid out. */
export function requestWithdrawal(plan: MoneyPlan, goalId: string, today: string, now: string): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) => {
      if (g.id !== goalId || g.withdrawal) return g;
      const v = vault(g, now, today, plan.currency);
      return { ...g, withdrawal: { requestedAt: today, early: !v.matured, amountCents: v.saved, status: "requested" } };
    }),
  };
}

/** Ledger reconciliation: saved = starting amount + sum of contributions, and every id is unique. */
export function reconcile(goal: Goal) {
  const ids = (goal.contributions ?? []).map((c) => c.id);
  const contributed = (goal.contributions ?? []).reduce((s, c) => s + c.amountCents, 0);
  return { contributed, total: goal.savedCents + contributed, uniqueIds: new Set(ids).size === ids.length, matches: goalSaved(goal) === goal.savedCents + contributed };
}

// ---------------------------------------------------------------- goal prioritisation

export interface GoalProposal {
  goalId: string;
  name: string;
  priority: Priority;
  neededCents: number;
  monthlyCents: number;
  currentDue: string;
  proposedDue: string | null;
  explanation: string;
}

/** When savings can't cover every goal: who gets what, and the dates to approve. Nothing changes until applied. */
export function goalProposals(plan: MoneyPlan, month: MonthPlan): { available: number; required: number; shortfall: number; proposals: GoalProposal[] } {
  const currency = plan.currency;
  const f = (c: number) => formatAmount(c, currency);
  const active = month.goals.filter((g) => g.status !== "done" && g.status !== "paused");
  const required = active.reduce((s, g) => s + g.neededCents, 0);
  const proposals = active
    .filter((g) => g.status === "behind" || g.status === "cannot-start")
    .map((g) => ({
      goalId: g.goal.id,
      name: g.goal.name,
      priority: g.goal.priority,
      neededCents: g.neededCents,
      monthlyCents: g.monthlyCents,
      currentDue: g.goal.dueMonth,
      proposedDue: g.reachMonth,
      explanation:
        g.status === "behind"
          ? `${g.goal.name} needs ${f(g.neededCents)} a month but only ${f(g.monthlyCents)} is free after higher-priority goals. At that pace it’s reached in ${monthLabel(g.reachMonth!)}.`
          : `${g.goal.name} gets nothing this month because higher-priority goals use all your savings. Pause it, raise its priority, or free up ${f(g.neededCents)} a month.`,
    }));
  return { available: month.goalsCents + month.freeCents, required, shortfall: Math.max(0, required - month.goalsCents), proposals };
}

export function applyProposals(plan: MoneyPlan, approved: Array<{ goalId: string; dueMonth: string }>): MoneyPlan {
  return { ...plan, goals: plan.goals.map((g) => ({ ...g, dueMonth: approved.find((a) => a.goalId === g.id)?.dueMonth ?? g.dueMonth })) };
}

// ---------------------------------------------------------------- missing information

export function missingInfo(plan: MoneyPlan): string[] {
  const out: string[] = [];
  if (plan.salaryCents <= 0) out.push("Your monthly income");
  if (!plan.bills.some((b) => (b.kind ?? "need") === "need")) out.push("Your essential expenses");
  if (!plan.bills.some((b) => b.kind === "want")) out.push("Your lifestyle limits");
  if (!plan.emergency) out.push("An emergency fund target");
  if (!plan.profile) out.push("Your household details (optional)");
  return out;
}

// ---------------------------------------------------------------- life changes

export type LifeChange =
  | { type: "salary"; newMonthlyCents: number }
  | { type: "marriage" }
  | { type: "child" }
  | { type: "dependent" }
  | { type: "rent"; newRentCents: number }
  | { type: "loan"; name: string; emiCents: number }
  | { type: "medical"; monthlyCents: number }
  | { type: "relocation"; newRentCents: number };

export interface LifeChangeProposal {
  plan: MoneyPlan;
  notes: string[];
}

function setYourSalary(plan: MoneyPlan, cents: number): MoneyPlan {
  if (!plan.incomes?.length) return withSalary(plan, cents);
  const incomes = plan.incomes.some((i) => i.kind === "salary")
    ? plan.incomes.map((i) => (i.kind === "salary" ? { ...i, amountCents: cents } : i))
    : [...plan.incomes, { id: "inc-salary", kind: "salary" as const, label: "Your salary", amountCents: cents }];
  return setIncomes(plan, incomes);
}

function setRent(plan: MoneyPlan, cents: number): MoneyPlan {
  const rent = plan.bills.find((b) => /rent/i.test(b.name) && (b.kind ?? "need") === "need");
  if (rent) return { ...plan, bills: plan.bills.map((b) => (b === rent ? { ...b, amountCents: cents, enteredCents: cents, frequency: "monthly", pct: null } : b)) };
  return setCategory(plan, { group: "Housing", name: "House rent", kind: "need", enteredCents: cents, fixed: true });
}

/** A proposed revised plan for a life event. It is only a proposal until the user approves it. */
export function proposeLifeChange(plan: MoneyPlan, change: LifeChange): LifeChangeProposal {
  const profile: Profile = { ...(plan.profile ?? {}) };
  const notes: string[] = [];
  let next = plan;
  switch (change.type) {
    case "salary":
      next = setYourSalary(plan, change.newMonthlyCents);
      notes.push("Percentage parts move with the new income; fixed expenses stay the same.");
      break;
    case "marriage":
      profile.maritalStatus = "married";
      profile.householdSize = Math.max(2, (profile.householdSize ?? 1) + 1);
      notes.push("Add your partner’s income under Income if they contribute, and review groceries and housing.");
      break;
    case "child":
      profile.children = (profile.children ?? 0) + 1;
      profile.householdSize = (profile.householdSize ?? 1) + 1;
      notes.push("We don’t guess new costs. Add childcare, school fees or medical costs you expect, and consider a larger emergency fund (6 months).");
      if (plan.emergency && plan.emergency.targetMonths < 6) next = setEmergency(plan, { targetMonths: 6 });
      break;
    case "dependent":
      profile.otherDependents = (profile.otherDependents ?? 0) + 1;
      profile.householdSize = (profile.householdSize ?? 1) + 1;
      notes.push("Add what you’ll spend to support them under Family support.");
      break;
    case "rent":
    case "relocation":
      next = setRent(plan, change.newRentCents);
      notes.push(change.type === "relocation" ? "Review transport and utilities for the new place too." : "Rent is essential, so lifestyle or goals absorb the difference.");
      break;
    case "loan":
      next = setCategory(plan, { group: "Loans and debt", name: change.name || "New loan EMI", kind: "need", enteredCents: change.emiCents, fixed: true });
      notes.push("EMIs are essential payments and are never reduced to fund lifestyle.");
      break;
    case "medical":
      next = setCategory(plan, { group: "Healthcare", name: "New medical costs", kind: "need", enteredCents: change.monthlyCents });
      notes.push("Medical costs are essential. Check your emergency fund covers a few months of them too.");
      break;
  }
  return { plan: { ...next, profile }, notes };
}

export interface PlanComparison {
  rows: Array<{ label: string; before: number; after: number }>;
  goalChanges: Array<{ name: string; before: string; after: string }>;
}

export function comparePlans(before: MoneyPlan, after: MoneyPlan, now: string): PlanComparison {
  const mb = planMonth(before, now);
  const ma = planMonth(after, now);
  const ab = allocation(before, mb);
  const aa = allocation(after, ma);
  const status = (s: string, reach: string | null) => (s === "on-track" ? "On track" : s === "done" ? "Done" : s === "paused" ? "Paused" : reach ? `Late: ${monthLabel(reach)}` : "No money yet");
  return {
    rows: [
      { label: "Monthly income", before: ab.income, after: aa.income },
      { label: "Essentials", before: ab.essentials, after: aa.essentials },
      { label: "Lifestyle", before: ab.lifestyle, after: aa.lifestyle },
      { label: "Emergency fund", before: ab.protection, after: aa.protection },
      { label: "Goals", before: ab.goals, after: aa.goals },
      { label: "Reserve", before: ab.reserve, after: aa.reserve },
    ],
    goalChanges: ma.goals
      .map((g) => {
        const old = mb.goals.find((x) => x.goal.id === g.goal.id);
        return { name: g.goal.name, before: old ? status(old.status, old.reachMonth) : "—", after: status(g.status, g.reachMonth) };
      })
      .filter((g) => g.before !== g.after),
  };
}

// ---------------------------------------------------------------- quick setup

export type HouseholdType = "single" | "couple" | "kids" | "joint";

export type EarningType = "salary" | "business" | "freelance";

/** Sensible starting counts when a household type is picked. */
export const FAMILY_DEFAULTS: Record<HouseholdType, { adults: number; children: number }> = {
  single: { adults: 1, children: 0 },
  couple: { adults: 2, children: 0 },
  kids: { adults: 2, children: 1 },
  joint: { adults: 4, children: 0 },
};

/** Keeps counts consistent with the household type: single is always 1 adult, a family with children has at least one child. */
export function familyCounts(a: Pick<QuickAnswers, "household" | "adults" | "children">): { adults: number; children: number; size: number } {
  const int = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));
  const adults = a.household === "single" ? 1 : int(a.adults, a.household === "joint" ? 3 : 2, 12);
  const children = a.household === "single" || a.household === "couple" ? 0 : int(a.children, a.household === "kids" ? 1 : 0, 10);
  return { adults, children, size: adults + children };
}

export { emergencyRate, householdSizeOf } from "./budget";

/** Months of essentials the emergency fund should cover: 6 when children or 3+ people depend on the income, otherwise 3. */
export function emergencyMonthsFor(familySize: number, children: number): number {
  return children > 0 || familySize >= 3 ? 6 : 3;
}

export type GoalKind = "house" | "car" | "bike" | "wedding" | "education" | "travel" | "gadget" | "other";

/** Goals people pick in the setup. Each becomes a lock-in savings plan (minimum ₹1,000 a month, no interest). */
export const GOAL_KINDS: Array<{ kind: GoalKind; label: string; name: string; lockMonths: number; priority: "high" | "medium" | "low" }> = [
  { kind: "house", label: "Buy a house", name: "House", lockMonths: 60, priority: "high" },
  { kind: "car", label: "Buy a car", name: "Car", lockMonths: 24, priority: "medium" },
  { kind: "bike", label: "Buy a bike", name: "Bike", lockMonths: 12, priority: "medium" },
  { kind: "education", label: "Education", name: "Education", lockMonths: 36, priority: "high" },
  { kind: "wedding", label: "Wedding", name: "Wedding", lockMonths: 24, priority: "medium" },
  { kind: "travel", label: "Holiday", name: "Holiday", lockMonths: 12, priority: "low" },
  { kind: "gadget", label: "Phone or laptop", name: "Phone or laptop", lockMonths: 6, priority: "low" },
  { kind: "other", label: "Something else", name: "My goal", lockMonths: 12, priority: "medium" },
];

export interface SetupGoal {
  kind: GoalKind;
  name: string;
  targetCents: number;
  savedCents: number;
  lockMonths: number;
}

export interface QuickAnswers {
  household: HouseholdType;
  /** New goals picked in the setup; they're added to the goals already in the plan. */
  goals: SetupGoal[];
  /** Adults living on this income (you, partner, parents). */
  adults: number;
  /** Children living on this income. */
  children: number;
  currency: CurrencyCode;
  /** How you earn. Business and freelance income counts only after costs and tax. */
  earning: EarningType;
  /** Salary: take-home pay. Business/freelance: money coming in during a normal month. */
  yourIncomeCents: number;
  /** Business/freelance only: operating costs and tax set aside each month. */
  businessCostsCents: number;
  medicalCents: number;
  partnerIncomeCents: number;
  rentCents: number;
  foodCents: number;
  billsCents: number;
  loansCents: number;
  schoolCents: number;
  parentsCents: number;
}

export const EMPTY_ANSWERS: QuickAnswers = {
  household: "single",
  goals: [],
  adults: 1,
  children: 0,
  currency: "INR",
  earning: "salary",
  yourIncomeCents: 0,
  businessCostsCents: 0,
  medicalCents: 0,
  partnerIncomeCents: 0,
  rentCents: 0,
  foodCents: 0,
  billsCents: 0,
  loansCents: 0,
  schoolCents: 0,
  parentsCents: 0,
};

/** Personal income from the answers: business turnover never counts, only what's left after costs and tax. */
export function personalIncome(a: Pick<QuickAnswers, "earning" | "yourIncomeCents" | "businessCostsCents">): number {
  const income = Math.max(0, Math.round(a.yourIncomeCents) || 0);
  return a.earning === "salary" ? income : Math.max(0, income - Math.max(0, Math.round(a.businessCostsCents) || 0));
}

/**
 * A complete LIVE · ENJOY · BUILD plan from a handful of answers. Only what
 * the user typed becomes an expense (LIVE). BUILD follows the savings policy
 * (aim 35–45%, at least 30% where affordable, never above 50%) and fills the
 * emergency fund first (3 months of essentials, 6 with children or a joint
 * family, finished in about a year, at most half of BUILD). ENJOY is what's
 * left, split into small category limits.
 */
export function quickPlan(a: QuickAnswers, base: MoneyPlan, now: string): MoneyPlan {
  const employment = a.earning === "salary" ? "employed" : a.earning;
  const fam = familyCounts(a);
  const profile: Profile = {
    employment,
    maritalStatus: a.household === "single" ? "single" : "married",
    livingWith: a.household === "single" ? "alone" : "family",
    householdSize: fam.size,
    children: fam.children,
    supportsParents: a.household === "joint",
    partnerEarns: a.partnerIncomeCents > 0,
  };
  const yours: IncomeSource =
    a.earning === "salary"
      ? { id: "inc-salary", kind: "salary", label: "Your take-home pay", amountCents: personalIncome(a) }
      : {
          id: "inc-salary",
          kind: "salary",
          label: a.earning === "business" ? "Your business income after costs and tax" : "Your freelance income after costs and tax",
          amountCents: personalIncome(a),
          grossCents: Math.max(0, a.yourIncomeCents),
          costsCents: Math.max(0, a.businessCostsCents),
        };
  const incomes: IncomeSource[] = [yours];
  if (a.household !== "single" && a.partnerIncomeCents > 0) incomes.push({ id: "inc-partner", kind: "partner", label: "Partner’s contribution", amountCents: a.partnerIncomeCents });

  // LIVE: the user's real costs, exactly as entered.
  let p: MoneyPlan = setIncomes({ ...base, currency: a.currency, profile, bills: [] }, incomes);
  const add = (group: string, name: string, cents: number, fixed = false) => {
    p = setCategory(p, { group, name, kind: "need", enteredCents: cents, fixed });
  };
  add("Housing", "Rent", a.rentCents, true);
  add("Food and groceries", "Food and groceries", a.foodCents);
  add("Utilities", "Bills, transport and phone", a.billsCents);
  add("Healthcare", "Medical and medicines", a.medicalCents);
  add("Loans and debt", "EMIs", a.loansCents, true);
  if (a.household === "kids" || a.household === "joint") add("Family and children", "School and childcare", a.schoolCents, true);
  if (a.household === "joint") add("Family support", "Support for parents", a.parentsCents);

  // Auto-pay: keep what the user had; rent is on auto-pay (the 1st) by default.
  p = {
    ...p,
    bills: p.bills.map((b) => {
      const before = base.bills.find((x) => x.name === b.name || OLD_NAMES[b.name] === x.name);
      // Rent on the 1st and EMIs on the 5th are on auto-pay by default.
      const rentDefault = b.name === "Rent" ? { day: 1, lastMonth: null } : b.name === "EMIs" ? { day: 5, lastMonth: null } : null;
      // Keep the user's choice (including "off"); a bill that never had a setting gets the default.
      return { ...b, id: before?.id ?? b.id, autoPay: before && before.autoPay !== undefined ? before.autoPay : rentDefault };
    }),
  };

  // BUILD: the savings policy, emergency fund first.
  const essentials = p.bills.filter((b) => (b.kind ?? "need") === "need").reduce((t, b) => t + b.amountCents, 0);
  const policy = allocateThreePriorities(p.salaryCents, essentials, a.currency);
  const targetMonths = emergencyMonthsFor(fam.size, fam.children);
  const saved = base.emergency?.savedCents ?? 0;
  const remaining = Math.max(0, essentials * targetMonths - saved);
  // At least 7–9% of income (by family size); more when needed to finish in about a year (up to half of BUILD).
  // Never more than BUILD, and never more than the fund still needs once essentials are known.
  const floor = (income: number) => Math.floor(income / 100) * 100;
  let monthly = Math.max(floor(p.salaryCents * emergencyRate(fam.size)), floor(Math.min(remaining / 12, policy.build / 2)));
  if (essentials > 0) monthly = Math.min(monthly, remaining);
  monthly = Math.max(0, Math.min(monthly, policy.build));
  p = { ...p, emergency: { targetMonths, savedCents: saved, monthlyCents: monthly } };

  // ENJOY: small category limits from what the policy leaves.
  const s = suggestLifestyle(p, now);
  for (const [group, cents] of Object.entries(s.byGroup)) if (cents > 0) p = setCategory(p, { group, name: group, kind: "want", enteredCents: cents });

  // Goals picked in the setup: each is a lock-in savings plan, paid from BUILD after the emergency fund.
  const added = (a.goals ?? [])
    .filter((g) => g.targetCents > 0)
    .map((g) => {
      const kind = GOAL_KINDS.find((k) => k.kind === g.kind) ?? GOAL_KINDS[GOAL_KINDS.length - 1];
      return createVaultGoal({ id: `g${catId()}`, name: (g.name || kind.name).slice(0, 60), targetCents: g.targetCents, savedCents: Math.min(g.savedCents, g.targetCents), lockMonths: g.lockMonths, priority: kind.priority }, now);
    });
  return added.length ? { ...p, goals: [...p.goals, ...added] } : p;
}

/** Bill names used before Rent and EMIs were asked separately. */
const OLD_NAMES: Record<string, string> = { Rent: "Rent or home EMI", EMIs: "Loan EMIs" };

/** Rebuilds quick-setup answers from a plan, so editing starts from what's there. */
export function answersFrom(plan: MoneyPlan): QuickAnswers {
  const amount = (name: string) => plan.bills.find((b) => b.name === name)?.amountCents ?? 0;
  const inc = incomeSummary(plan);
  const pr = plan.profile;
  const household: HouseholdType = pr?.supportsParents ? "joint" : (pr?.children ?? 0) > 0 ? "kids" : pr?.maritalStatus === "married" ? "couple" : "single";
  const kids = pr?.children ?? FAMILY_DEFAULTS[household].children;
  const adults = pr?.householdSize != null ? Math.max(1, pr.householdSize - kids) : FAMILY_DEFAULTS[household].adults;
  const mine = plan.incomes?.find((i) => i.kind === "salary");
  const earning: EarningType = pr?.employment === "business" || pr?.employment === "freelance" ? pr.employment : "salary";
  return {
    household,
    ...familyCounts({ household, adults, children: kids }),
    currency: plan.currency ?? "INR",
    earning,
    yourIncomeCents: earning === "salary" ? inc.yours : (mine?.grossCents ?? inc.yours),
    businessCostsCents: earning === "salary" ? 0 : (mine?.costsCents ?? 0),
    medicalCents: amount("Medical and medicines"),
    partnerIncomeCents: inc.partner,
    rentCents: amount("Rent") || amount("Rent or home EMI"),
    foodCents: amount("Food and groceries"),
    billsCents: amount("Bills, transport and phone"),
    loansCents: amount("EMIs") || amount("Loan EMIs"),
    goals: [],
    schoolCents: amount("School and childcare"),
    parentsCents: amount("Support for parents"),
  };
}

// ---------------------------------------------------------------- auto-pay

/** Today's date in the user's own time zone, "YYYY-MM-DD". */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Turns auto-pay on (day 1–28) or off for a bill. Recording starts from the current month. */
export function setAutoPay(plan: MoneyPlan, billId: string, day: number | null): MoneyPlan {
  return {
    ...plan,
    bills: plan.bills.map((b) => (b.id === billId ? { ...b, autoPay: day == null ? null : { day: Math.min(28, Math.max(1, Math.round(day))), lastMonth: b.autoPay?.lastMonth ?? null } } : b)),
  };
}

/**
 * Records each auto-pay bill once a month, on or after its day. Idempotent:
 * the expense id is `auto-<bill>-<month>` and the bill remembers the last
 * month it ran, so a reload, a second tab or a deleted entry never pays twice.
 * Returns the same plan object when nothing is due.
 */
/** Auto-save for a goal: locked goals are on (the 1st) unless the user switched it off. */
export function autoSaveOf(g: Goal): { day: number; lastMonth?: string | null } | null {
  // An active auto-debit (mandate) replaces auto-save for that fund.
  if (!g.lockMonths || g.autoSave === null || g.mandate?.status === "active") return null;
  return g.autoSave ?? { day: 1, lastMonth: null };
}

/** Turns a locked goal's monthly auto-save on (day 1–28) or off. */
export function setAutoSave(plan: MoneyPlan, goalId: string, day: number | null): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) => (g.id === goalId ? { ...g, autoSave: day == null ? null : { day: Math.min(28, Math.max(1, Math.round(day))), lastMonth: g.autoSave?.lastMonth ?? null } } : g)),
  };
}

/**
 * Locked goals on auto-save get this month's planned amount recorded once, on
 * or after their day. Idempotent: the contribution id is `<goal>:<month>`, and
 * a month already recorded by hand is simply marked done. Nothing is recorded
 * while a goal is paused, withdrawn, finished, or has no money free for it.
 */
function applyAutoSaves(plan: MoneyPlan, today: string, recorded: string[]): MoneyPlan {
  const month = today.slice(0, 7);
  const dayNum = Number(today.slice(8, 10));
  const due = plan.goals.filter((g) => {
    const a = autoSaveOf(g);
    // Fully saved funds are left alone (nothing to record, nothing to mark).
    return a && a.lastMonth !== month && dayNum >= a.day && !g.paused && !g.withdrawal && (!g.startMonth || g.startMonth <= month) && g.targetCents - goalSaved(g) > 0;
  });
  if (!due.length) return plan;
  const monthPlan = planMonth(plan, month);
  let next = plan;
  for (const g of due) {
    const gp = monthPlan.goals.find((x) => x.goal.id === g.id);
    const remaining = Math.max(0, g.targetCents - goalSaved(g));
    const amount = Math.min(gp?.monthlyCents ?? 0, remaining);
    if (remaining > 0 && amount <= 0) continue; // nothing free for it this month: try again later
    const a = autoSaveOf(g)!;
    if (amount > 0) {
      const r = recordContribution(next, g.id, { month, date: `${month}-${String(a.day).padStart(2, "0")}`, amountCents: amount, kind: "scheduled" });
      next = r.plan;
      if (!r.duplicate) recorded.push(g.name);
    }
    next = { ...next, goals: next.goals.map((x) => (x.id === g.id ? { ...x, autoSave: { day: a.day, lastMonth: month } } : x)) };
  }
  return next;
}

export function applyAutoPays(plan: MoneyPlan, today: string): { plan: MoneyPlan; recorded: string[] } {
  const month = today.slice(0, 7);
  const dayNum = Number(today.slice(8, 10));
  const recorded: string[] = [];
  let expenses = plan.expenses;
  const bills = plan.bills.map((b) => {
    if (!b.autoPay || b.autoPay.lastMonth === month || dayNum < b.autoPay.day || b.amountCents <= 0) return b;
    const id = `auto-${b.id}-${month}`;
    if (!expenses.some((e) => e.id === id)) {
      expenses = [...expenses, { id, date: `${month}-${String(b.autoPay.day).padStart(2, "0")}`, amountCents: b.amountCents, note: `Auto-pay: ${b.name}`, source: { kind: "bill", billId: b.id } }];
      recorded.push(b.name);
    }
    return { ...b, autoPay: { ...b.autoPay, lastMonth: month } };
  });
  const afterBills = bills.every((b, i) => b === plan.bills[i]) ? plan : { ...plan, bills, expenses };
  // Then locked goals, from what's left after the bills.
  return { plan: applyAutoSaves(afterBills, today, recorded), recorded };
}

/** The next date an auto-pay bill will be recorded. */
export function nextAutoPay(day: number, today: string, lastMonth?: string | null): string {
  const month = today.slice(0, 7);
  const target = lastMonth === month || Number(today.slice(8, 10)) > day ? addMonths(month, 1) : month;
  return `${target}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- today's spending money

export interface TodayAllowance {
  /** What can be spent today: what was left this morning, shared over the days left (today included). */
  allowanceCents: number;
  spentTodayCents: number;
  /** Can be negative when today's spending went over. */
  leftTodayCents: number;
  /** The daily amount from tomorrow, after today's spending. */
  fromTomorrowCents: number;
}

/**
 * Keeps recalculating the daily amount: every morning the money left in a
 * category is shared over the days left, so spending less today means more
 * tomorrow, and spending more means a little less each day after.
 */
export function todayAllowance(limitCents: number, spentMonthCents: number, spentTodayCents: number, day: number, daysInMonth: number): TodayAllowance {
  const daysLeft = Math.max(1, daysInMonth - day + 1);
  const leftThisMorning = Math.max(0, limitCents - (spentMonthCents - spentTodayCents));
  const allowanceCents = Math.floor(leftThisMorning / daysLeft / 100) * 100;
  const leftAfterToday = Math.max(0, limitCents - spentMonthCents);
  const fromTomorrowCents = daysLeft > 1 ? Math.floor(leftAfterToday / (daysLeft - 1) / 100) * 100 : 0;
  return { allowanceCents, spentTodayCents, leftTodayCents: allowanceCents - spentTodayCents, fromTomorrowCents };
}

/** Spending logged today for each bill id. */
export function spentToday(plan: MoneyPlan, today: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of plan.expenses) if (e.date === today && e.source.kind === "bill") m.set(e.source.billId, (m.get(e.source.billId) ?? 0) + e.amountCents);
  return m;
}


/** Sets a locked fund's step-up: 5% every month, 5% every year, or none (null). */
export function setStepUp(plan: MoneyPlan, goalId: string, step: StepUp | null): MoneyPlan {
  return { ...plan, goals: plan.goals.map((g) => (g.id === goalId ? { ...g, stepUp: step } : g)) };
}
