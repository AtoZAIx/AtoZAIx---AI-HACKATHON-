/**
 * Advanced money-plan analysis: a transparent health score and specific,
 * computed insights with one-tap fixes. Pure and browser-safe. Every number
 * comes from the plan; the AI coach may only rephrase these numbers.
 */
import { addMonths, monthLabel, splitByKind, type MoneyPlan, type MonthPlan, type MonthSpending } from "./budget";
import { formatAmount, personalTargets } from "./household";
import { planPriorities, SAVINGS_POLICY } from "./savings-policy";

export type InsightTone = "good" | "warn" | "bad" | "info";

export type InsightAction =
  | { type: "move-date"; goalId: string; dueMonth: string; label: string }
  | { type: "add-emergency"; targetCents: number; dueMonth: string; label: string };

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  action?: InsightAction;
}

export interface ScorePart {
  key: "savings" | "needs" | "emergency" | "goals" | "pace" | "debt" | "buffer";
  label: string;
  /** 0–1 */
  value: number;
  weight: number;
  note: string;
}

export interface MoneyHealth {
  score: number;
  band: "strong" | "fair" | "needs-work";
  parts: ScorePart[];
  insights: Insight[];
  /** Every amount the analysis mentions, for checking AI text. */
  amounts: number[];
}

const EMERGENCY = /emergenc|rainy|safety|buffer|cushion/i;
const HOUSING = /rent|mortgage|housing|lease/i;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const pct = (f: number) => `${Math.round(f * 100)}%`;

export interface Clock {
  now: string;
  day: number;
  daysInMonth: number;
}

export function clockFor(d: Date): Clock {
  return {
    now: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    day: d.getDate(),
    daysInMonth: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
  };
}

export function analyzeMoney(plan: MoneyPlan, month: MonthPlan, spending: MonthSpending, clock: Clock): MoneyHealth {
  const salary = month.salaryCents;
  const insights: Insight[] = [];
  const amounts = new Set<number>([salary, month.billsCents, month.goalsCents, month.freeCents, ...plan.bills.map((b) => b.amountCents)]);
  const money = (c: number) => {
    const rounded = Math.round(c / 100) * 100;
    amounts.add(rounded);
    return formatAmount(rounded, plan.currency);
  };

  const split = splitByKind(plan);
  const usesKinds = plan.bills.some((b) => b.kind === "want");
  // ---- needs share
  const needsCents = usesKinds ? split.needs : month.billsCents;
  // ---- emergency cover (months of bills already saved)
  // Only the explicit emergency fund counts; older plans may have a goal the user named "Emergency fund".
  const emergencyGoals = plan.emergency ? [] : plan.goals.filter((g) => EMERGENCY.test(g.name));
  const hasEmergency = Boolean(plan.emergency) || emergencyGoals.length > 0;
  const emergencySaved = plan.emergency ? plan.emergency.savedCents : emergencyGoals.reduce((s, g) => s + g.savedCents, 0);
  const coverMonths = needsCents > 0 ? emergencySaved / needsCents : hasEmergency ? 6 : 0;
  // ---- goals on time
  const open = month.goals.filter((g) => g.status !== "done");
  const onTime = open.filter((g) => g.status === "on-track").length;
  // ---- spending pace: personal parts (or free money, for older plans)
  const wantIds = plan.bills.filter((b) => b.kind === "want").map((b) => b.id);
  const freePlanned = usesKinds ? split.wants : month.freeCents;
  const spent = usesKinds ? wantIds.reduce((s, id) => s + (spending.byBill.get(id) ?? 0), 0) + spending.freeLoggedCents : spending.freeSpentCents;
  const expectedSoFar = freePlanned * (clock.day / clock.daysInMonth);
  const projected = clock.day > 0 ? (spent / clock.day) * clock.daysInMonth : spent;
  const paceRatio = expectedSoFar > 0 ? spent / expectedSoFar : spent > 0 ? 2 : 1;

  // Personal targets: what this household's own goals and safety net need, not a fixed percentage.
  const targets = personalTargets(plan, clock.now);
  const pri = planPriorities(plan, month);
  const room = Math.max(0, salary - needsCents);
  const parts: ScorePart[] = [
    {
      key: "savings",
      // Savings rate against the policy: 35–45% is full marks, 30% is good, below that scales down.
      // Low savings caused by real essentials is explained in the note, not shamed.
      label: "Savings rate",
      value: salary <= 0 ? 0 : pri.rate >= SAVINGS_POLICY.preferredMin - 1e-9 ? 1 : pri.rate >= SAVINGS_POLICY.fallback - 1e-9 ? 0.85 : clamp((pri.rate / SAVINGS_POLICY.fallback) * 0.7),
      weight: 20,
      note: salary <= 0 ? "Add your income to see your savings rate." : `${Math.round(pri.rate * 100)}% of income (${money(pri.build)} a month). We aim for 35–45%, at least 30% where affordable, never above 50%.`,
    },
    {
      key: "needs",
      label: "Room after essentials",
      value: salary <= 0 ? 0 : targets.savingsNeed > 0 ? clamp(room / targets.savingsNeed) : needsCents <= salary ? 1 : 0,
      weight: 15,
      note:
        targets.savingsNeed > 0
          ? `After essentials, ${money(room)} is left for the ${money(targets.savingsNeed)} you need to save.`
          : `After essentials of ${money(needsCents)}, ${money(room)} is left each month.`,
    },
    {
      key: "emergency",
      label: "Emergency cover",
      value: clamp(coverMonths / 3),
      weight: 20,
      note: hasEmergency ? `${Math.floor(coverMonths * 10) / 10} months of essentials saved (3 to 6 is a common target).` : "No emergency fund yet.",
    },
    {
      key: "goals",
      label: "Goals on time",
      value: open.length ? onTime / open.length : 1,
      weight: 15,
      note: open.length ? `${onTime} of ${open.length} open goal${open.length === 1 ? "" : "s"} on schedule.` : "No open goals.",
    },
    {
      key: "pace",
      label: "Spending pace",
      value: clamp(1 - (paceRatio - 1) / 0.5),
      weight: 10,
      note: freePlanned > 0 ? `${money(spent)} of ${money(freePlanned)} personal money spent, ${clock.day} of ${clock.daysInMonth} days in.` : "No personal spending planned this month.",
    },
  ];
  // Debt load: loan and card repayments as a share of income (10% or less is light; 40%+ is heavy).
  const debt = plan.bills.filter((b) => b.group === "Loans and debt" || /\b(emi|loan|credit card)\b/i.test(b.name)).reduce((s, b) => s + b.amountCents, 0);
  const debtShare = salary > 0 ? debt / salary : 0;
  parts.push({
    key: "debt",
    label: "Debt load",
    value: clamp(1 - (debtShare - 0.1) / 0.3),
    weight: 10,
    note: debt > 0 ? `Loan and card repayments take ${pct(debtShare)} of income.` : "No loan repayments listed.",
  });
  // Cash buffer: money not assigned to anything this month (5% of income or more is comfortable).
  const bufferShare = salary > 0 ? month.freeCents / salary : 0;
  parts.push({
    key: "buffer",
    label: "Cash buffer",
    value: clamp(bufferShare / 0.05),
    weight: 10,
    note: `${money(month.freeCents)} a month (${pct(bufferShare)}) is left unassigned as a buffer.`,
  });
  const score = salary > 0 ? Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0)) : 0;

  // ---------------------------------------------------------------- insights
  if (month.billsExceedSalary) {
    insights.push({
      id: "bills-over",
      tone: "bad",
      title: "Bills are more than your pay",
      detail: `They're ${money(month.billsCents - salary)} over each month. Cut or renegotiate the biggest bill first; no goal can be funded until this changes.`,
    });
  }

  const housing = plan.bills.filter((b) => HOUSING.test(b.name)).reduce((s, b) => s + b.amountCents, 0);
  if (salary > 0 && housing / salary > 0.3) {
    insights.push({
      id: "housing",
      tone: "warn",
      title: "Housing takes a big share",
      detail: `Rent or mortgage is ${pct(housing / salary)} of your take-home pay (${money(housing)}). HUD counts over 30% of income before tax as cost-burdened, so on take-home pay aim lower.`,
    });
  }

  if (needsCents > 0 && !hasEmergency) {
    const target = needsCents * 3;
    insights.push({
      id: "emergency-missing",
      tone: "warn",
      title: "Start an emergency fund",
      detail: `Three months of needs is ${money(target)}. Saving it over a year takes about ${money(Math.ceil(target / 12))} a month.`,
      action: { type: "add-emergency", targetCents: target, dueMonth: addMonths(clock.now, 11), label: "Start my emergency fund" },
    });
  } else if (hasEmergency && coverMonths < 3) {
    insights.push({
      id: "emergency-low",
      tone: "info",
      title: "Emergency fund is growing",
      detail: `You have ${Math.floor(coverMonths * 10) / 10} months of needs saved. Three months would be ${money(needsCents * 3)}.`,
    });
  }

  for (const g of month.goals) {
    if (g.status === "behind" && g.reachMonth) {
      insights.push({
        id: `behind-${g.goal.id}`,
        tone: "warn",
        title: `${g.goal.name} is behind`,
        detail: `It needs ${money(g.neededCents)} a month but gets ${money(g.monthlyCents)}. Moving the date to ${monthLabel(g.reachMonth)} keeps it realistic.`,
        action: { type: "move-date", goalId: g.goal.id, dueMonth: g.reachMonth, label: `Move to ${monthLabel(g.reachMonth)}` },
      });
    } else if (g.status === "cannot-start") {
      insights.push({
        id: `blocked-${g.goal.id}`,
        tone: "bad",
        title: `${g.goal.name} has no money yet`,
        detail: `It needs ${money(g.neededCents)} a month. Lower a bill, raise its priority, or pick a later date.`,
      });
    }
  }

  // Unplanned money beyond ~30%: show how much sooner the top goal could land.
  const extra = month.freeCents;
  const firstOpen = month.goals.find((g) => g.status === "on-track" && g.remainingCents > 0);
  if (salary > 0 && extra >= 5000 && firstOpen) {
    const faster = Math.ceil(firstOpen.remainingCents / (firstOpen.monthlyCents + extra));
    const sooner = addMonths(clock.now, Math.max(0, faster - 1));
    if (sooner < firstOpen.goal.dueMonth) {
      insights.push({
        id: "unplanned",
        tone: "info",
        title: "You have room to save faster",
        detail: usesKinds
          ? `About ${money(extra)} of your savings part isn't assigned to a goal yet. Putting it toward ${firstOpen.goal.name} would reach it by ${monthLabel(sooner)}.`
          : `About ${money(extra)} a month isn't assigned to anything. Putting it toward ${firstOpen.goal.name} would reach it by ${monthLabel(sooner)}.`,
        action: { type: "move-date", goalId: firstOpen.goal.id, dueMonth: sooner, label: `Aim for ${monthLabel(sooner)}` },
      });
    }
  }

  if (freePlanned > 0 && clock.day >= 3) {
    const left = freePlanned - spent;
    const daysLeft = clock.daysInMonth - clock.day + 1;
    if (projected > freePlanned * 1.05) {
      insights.push({
        id: "pace",
        tone: left < 0 ? "bad" : "warn",
        title: left < 0 ? "Free money is used up" : "Spending is ahead of plan",
        detail:
          left < 0
            ? `You've spent ${money(-left)} more than planned this month. Extra spending now comes out of goals.`
            : `At this pace you'll spend about ${money(projected)} by month end. Keep to ${money(left / daysLeft)} a day to stay within ${money(freePlanned)}.`,
      });
    } else if (spent > 0) {
      insights.push({
        id: "pace-ok",
        tone: "good",
        title: "Spending is on pace",
        detail: `${money(left)} left to spend over ${daysLeft} days, about ${money(left / daysLeft)} a day.`,
      });
    }
  }

  if (salary > 0 && targets.savingsNeed > 0 && targets.savingsPlanned >= targets.savingsNeed) {
    insights.push({ id: "savings-good", tone: "good", title: "Savings on track", detail: `${money(targets.savingsPlanned)} a month covers what your goals and emergency fund need.` });
  }

  const order: Record<InsightTone, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);
  return { score, band: score >= 75 ? "strong" : score >= 50 ? "fair" : "needs-work", parts, insights, amounts: [...amounts].filter((a) => a > 0) };
}
