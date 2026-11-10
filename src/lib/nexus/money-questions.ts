/**
 * Money coach answers, computed in the browser from the user's own plan.
 * Every figure comes from the deterministic engine; nothing is invented, no
 * data leaves the device, and nothing is changed without the user approving it.
 */
import { allowance, goalSaved, monthLabel, planMonth, type MoneyPlan } from "./budget";
import { planPriorities } from "./savings-policy";
import { allocation, categoryStatuses, comparePlans, emergencyStatus, formatAmount, goalProposals, incomeSummary, proposeLifeChange } from "./household";
import type { MonthSpending } from "./budget";

export interface CoachAnswer {
  answer: string;
  assumptions: string[];
}

export const EXAMPLE_QUESTIONS = [
  "How should I divide my salary?",
  "Why is my savings rate this?",
  "How can I save 40%?",
  "How much can I spend this week?",
  "How much should I spend on groceries?",
  "Am I spending too much on restaurants?",
  "Can I afford a car?",
  "How much can I save every month?",
  "How long will it take to buy a house?",
  "Can I achieve all my goals at once?",
  "How much should I keep for emergencies?",
  "What happens if my salary increases?",
  "What happens if my family size increases?",
  "Can I afford a vacation this year?",
];

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function answerMoneyQuestion(question: string, plan: MoneyPlan, spending: MonthSpending, now: string, day: number, daysInMonth: number): CoachAnswer {
  const q = question.toLowerCase();
  const f = (c: number) => formatAmount(c, plan.currency);
  const month = planMonth(plan, now);
  const alloc = allocation(plan, month);
  const pct = (c: number) => (plan.salaryCents > 0 ? `${Math.round((c / plan.salaryCents) * 100)}%` : "0%");
  const base = ["Uses your take-home income and the amounts you entered; nothing is estimated."];

  if (plan.salaryCents <= 0) return { answer: "Add your monthly take-home income first, then I can work this out from your own numbers.", assumptions: [] };

  const goalLike = (re: RegExp) => plan.goals.find((g) => re.test(g.name));
  const affordGoal = (re: RegExp, label: string): CoachAnswer => {
    const g = goalLike(re);
    if (!g) return { answer: `Add a ${label} goal with its price and the date you want it, and I’ll tell you the monthly amount and whether it fits.`, assumptions: base };
    const gp = month.goals.find((x) => x.goal.id === g.id)!;
    if (gp.status === "done") return { answer: `Yes: you’ve already saved ${f(goalSaved(g))} for ${g.name}.`, assumptions: base };
    const fits = gp.status === "on-track";
    return {
      answer: fits
        ? `Yes. ${g.name} needs ${f(gp.neededCents)} a month until ${monthLabel(g.dueMonth)}, and your savings cover it.`
        : `Not by ${monthLabel(g.dueMonth)} yet. It needs ${f(gp.neededCents)} a month but ${f(gp.monthlyCents)} is free after higher-priority goals${gp.reachMonth ? `, so it lands around ${monthLabel(gp.reachMonth)}` : ""}. You could extend the date, lower the target, or trim lifestyle limits.`,
      assumptions: [...base, "Goals are funded in priority order, then by earliest date."],
    };
  };

  const pri = planPriorities(plan, month);
  const policyNote = "Savings policy: aim for 35–45% of income, at least 30% where affordable, never above 50%. Essentials always come first.";

  if (/divide|split|allocate|plan my (salary|income)/.test(q)) {
    return {
      answer: `Of ${f(pri.income)}: LIVE ${f(pri.live)} (${pct(pri.live)}) for essentials, ENJOY ${f(pri.enjoy)} (${pct(pri.enjoy)}) for yourself, and BUILD ${f(pri.build)} (${pct(pri.build)}) for savings: ${f(alloc.protection)} emergency fund, ${f(alloc.goals)} goals and the rest in your other pots.${pri.unassigned > 0 ? ` ${f(pri.unassigned)} isn’t assigned yet.` : ""}`,
      assumptions: [...base, policyNote],
    };
  }
  if (/save\s*(40|45|35)|reach\s*(40|35)|more savings|save more|increase (my )?sav/.test(q)) {
    if (pri.status === "shortfall") return { answer: pri.explanation, assumptions: [...base, policyNote] };
    if (pri.toTarget > 0)
      return {
        answer: `You save ${pct(pri.build)} now. Lowering your ENJOY limits by ${f(pri.toTarget)} a month would bring savings to 40% (${f(pri.targetCents)}). You choose which limits; nothing changes until you do.`,
        assumptions: [...base, policyNote],
      };
    if (pri.rate >= 0.4) return { answer: `You already save ${pct(pri.build)} (${f(pri.build)} a month).`, assumptions: [...base, policyNote] };
    return {
      answer: `Your essentials take ${pct(pri.live)} of income, so 40% isn’t reachable without cutting essentials, which we never do. Today the most is about ${pct(pri.build)}. A raise, a finished EMI or a lower rent would change that.`,
      assumptions: [...base, policyNote],
    };
  }
  if (/savings rate|why.*(sav|30|40)|how much.*percent|what percent/.test(q)) {
    return { answer: `${pri.explanation} That’s ${f(pri.build * 12)} a year.`, assumptions: [...base, policyNote] };
  }
  if (/this week|per week|weekly/.test(q)) {
    const left = allowance(plan, spending, day, daysInMonth);
    if (!left) return { answer: "Set some ENJOY limits first and I’ll turn them into a weekly amount.", assumptions: [] };
    return {
      answer: `About ${f(Math.min(left.monthCents - left.spentCents, left.leftPerDayCents * 7))} this week: ${f(left.leftPerDayCents)} a day for the ${left.daysLeft} days left, from ${f(left.monthCents - left.spentCents)} still unspent in your ENJOY limits.`,
      assumptions: [...base, "Counts spending you logged this month. Essentials and savings are never touched."],
    };
  }
  if (/grocer/.test(q)) {
    const g = plan.bills.filter((b) => b.group === "Food and groceries" || /grocer|vegetable|milk/i.test(b.name));
    if (!g.length) return { answer: "You haven’t entered grocery costs yet. Add what you actually spend in a month and I’ll compare it with your income.", assumptions: [] };
    const total = sum(g.map((b) => b.amountCents));
    return { answer: `You plan ${f(total)} a month for food and groceries, ${pct(total)} of your income.`, assumptions: base };
  }
  if (/restaurant|eating out|food delivery|cafe|outing/.test(q)) {
    const items = categoryStatuses(plan, spending, day, daysInMonth).filter((x) => x.item.group === "Food and outings" || /restaurant|cafe|delivery|outing/i.test(x.item.name));
    if (!items.length) return { answer: "Set a limit for restaurants or food delivery under your lifestyle spending and I’ll track it.", assumptions: [] };
    const limit = sum(items.map((x) => x.status.limitCents));
    const spent = sum(items.map((x) => x.status.spentCents));
    return {
      answer:
        spent > limit
          ? `Yes, this month: ${f(spent)} spent against a ${f(limit)} limit, ${f(spent - limit)} over.`
          : `Not so far: ${f(spent)} of ${f(limit)} used, with ${f(limit - spent)} left this month.`,
      assumptions: [...base, "Counts spending you logged this month."],
    };
  }
  if (/\bcar\b|vehicle/.test(q)) return affordGoal(/car|vehicle|bike/i, "car");
  if (/vacation|holiday|trip|travel/.test(q)) return affordGoal(/vacation|holiday|trip|travel/i, "vacation");
  if (/house|home|flat|apartment/.test(q)) {
    const g = goalLike(/house|home|flat|apartment/i);
    if (!g) return { answer: "Add a house goal (down payment or full price) with a date, and I’ll show the monthly amount and when you’ll get there.", assumptions: [] };
    const gp = month.goals.find((x) => x.goal.id === g.id)!;
    return {
      answer: gp.reachMonth
        ? `At ${f(gp.monthlyCents)} a month you’ll reach ${f(g.targetCents)} for ${g.name} around ${monthLabel(gp.reachMonth)}.`
        : `${g.name} isn’t getting any savings yet. It needs ${f(gp.neededCents)} a month to reach ${monthLabel(g.dueMonth)}.`,
      assumptions: base,
    };
  }
  if (/save|saving/.test(q) && !/goal/.test(q)) {
    return {
      answer: `Your BUILD is ${f(pri.build)} a month (${pct(pri.build)} of income, ${f(pri.build * 12)} a year): ${f(month.emergencyCents)} to your emergency fund, ${f(month.goalsCents)} to goals, and the rest to your health, retirement and flexible pots.`,
      assumptions: [...base, policyNote],
    };
  }
  if (/goals|three|multiple|at once|simultaneous/.test(q)) {
    const p = goalProposals(plan, month);
    if (!plan.goals.length) return { answer: "You don’t have any goals yet. Add them with a target and date.", assumptions: [] };
    return {
      answer: p.proposals.length
        ? `Not all on time. Your goals need ${f(p.required)} a month; ${f(p.shortfall)} is missing. ${p.proposals.map((x) => x.explanation).join(" ")}`
        : `Yes. All ${plan.goals.length} goals fit: they need ${f(p.required)} a month and your savings cover it.`,
      assumptions: [...base, "Higher-priority goals are funded first; nothing changes until you approve new dates."],
    };
  }
  if (/emergenc/.test(q)) {
    const e = emergencyStatus(plan, now);
    return {
      answer: `Your essentials are ${f(e.essentialsMonthly)} a month, so 3 months is ${f(e.target3)} and 6 months is ${f(e.target6)}. You have ${f(e.saved)}; ${f(e.remaining)} to go for your ${e.targetMonths}-month target, about ${f(e.suggestedMonthly)} a month to finish in a year.`,
      assumptions: ["3 to 6 months of essential costs is the common rule of thumb; choose more if your income is irregular or you support others."],
    };
  }
  if (/salary|income|raise|increment|hike/.test(q) && /increase|raise|more|hike|increment|grow/.test(q)) {
    const yours = incomeSummary(plan).yours || plan.salaryCents;
    // "…increases by ₹5,000": use the stated amount; otherwise assume a 10% raise.
    const stated = /(?:by|of)\s*[₹$€£]?\s*([\d,]+)/.exec(q);
    const extra = stated ? Number(stated[1].replace(/,/g, "")) * 100 : 0;
    const newPay = extra > 0 ? yours + extra : Math.round((yours * 1.1) / 100) * 100;
    const raised = proposeLifeChange(plan, { type: "salary", newMonthlyCents: newPay });
    const c = comparePlans(plan, raised.plan, now);
    const reserve = c.rows.find((r) => r.label === "Reserve")!;
    const goals = c.rows.find((r) => r.label === "Goals")!;
    return {
      answer: `With your pay at ${f(newPay)}, goals would get ${f(goals.after)} a month instead of ${f(goals.before)}, and your free savings would be ${f(reserve.after)}. Putting most of a raise into BUILD keeps your lifestyle steady and lifts your savings rate.`,
      assumptions: [extra > 0 ? `Assumes your take-home pay rises by ${f(extra)} and expenses stay the same.` : "Assumes a 10% raise in your own take-home pay and no change to expenses."],
    };
  }
  if (/family|child|baby|kid|dependent/.test(q)) {
    const p = proposeLifeChange(plan, { type: "child" });
    return { answer: `Your plan stays the same until you add the new costs. ${p.notes.join(" ")}`, assumptions: ["We never guess new family expenses; they come from what you enter."] };
  }
  return {
    answer: `I can answer questions about your own plan, for example: ${EXAMPLE_QUESTIONS.slice(0, 4).join(" · ")}`,
    assumptions: [],
  };
}
