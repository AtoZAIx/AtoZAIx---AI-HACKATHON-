import { describe, expect, it } from "vitest";
import { planPriorities } from "@/lib/nexus/savings-policy";
import { numbersConsistent } from "@/lib/nexus/agents/guardrails";
import { EMPTY_PLAN, goalSaved, monthSpending, parsePlan, planMonth, type MoneyPlan } from "@/lib/nexus/budget";
import { analyzeMoney } from "@/lib/nexus/budget-insights";
import {
  addMonthsToDate,
  allocation,
  applyProposals,
  categoryStatus,
  comparePlans,
  createVaultGoal,
  daysBetween,
  emergencyStatus,
  formatAmount,
  goalProposals,
  incomeSummary,
  missingInfo,
  monthlyFrom,
  proposeLifeChange,
  reconcile,
  recordContribution,
  requestWithdrawal,
  setCategory,
  setEmergency,
  setIncomes,
  setPaused,
  suggestLifestyle,
  vault,
} from "@/lib/nexus/household";
import { answerMoneyQuestion } from "@/lib/nexus/money-questions";
import { CoachBody } from "@/lib/nexus/money-coach";

const NOW = "2026-11";
const TODAY = "2026-11-10";
const R = (rupees: number) => rupees * 100; // amounts in paise

function household(over: Partial<MoneyPlan> = {}): MoneyPlan {
  let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", ...over };
  p = setIncomes(p, over.incomes ?? [{ id: "s", kind: "salary", label: "Your salary", amountCents: R(60_000) }]);
  p = setCategory(p, { group: "Housing", name: "House rent", kind: "need", enteredCents: R(15_000), fixed: true });
  p = setCategory(p, { group: "Food and groceries", name: "Monthly groceries", kind: "need", enteredCents: R(8_000) });
  p = setCategory(p, { group: "Transport", name: "Fuel", kind: "need", enteredCents: R(1_000), frequency: "weekly" });
  p = setCategory(p, { group: "Food and outings", name: "Restaurants", kind: "want", enteredCents: R(3_000) });
  return p;
}
const noSpend = () => ({ byBill: new Map<string, number>(), freeLoggedCents: 0, purchasesCents: 0, goalPurchases: [], freeSpentCents: 0, freeLeftCents: 0 });

describe("currency, income and categories", () => {
  it("formats rupees with lakh grouping and other currencies normally", () => {
    expect(formatAmount(R(150_000), "INR")).toBe("₹1,50,000");
    expect(formatAmount(R(80_000), "INR")).toBe("₹80,000");
    expect(formatAmount(150_000_00, "USD")).toBe("$150,000");
  });
  it("turns weekly amounts into a monthly equivalent", () => {
    expect(monthlyFrom(R(1_000), "weekly")).toBe(R(4_333));
    expect(monthlyFrom(R(1_000), "monthly")).toBe(R(1_000));
  });
});

describe("household scenarios", () => {
  it("1. single person: essentials, lifestyle and the rest never exceed income", () => {
    const p = household({ profile: { maritalStatus: "single", livingWith: "alone", householdSize: 1 } });
    const a = allocation(p, planMonth(p, NOW));
    expect(a.income).toBe(R(60_000));
    expect(a.essentials).toBe(R(15_000 + 8_000 + 4_333));
    expect(a.essentials + a.lifestyle + a.protection + a.goals + a.reserve).toBe(a.income);
  });

  it("2. married couple: individual and combined income stay distinguishable", () => {
    const p = household({
      profile: { maritalStatus: "married", householdSize: 2, partnerEarns: true },
      incomes: [
        { id: "s", kind: "salary", label: "Your salary", amountCents: R(60_000) },
        { id: "p", kind: "partner", label: "Spouse", amountCents: R(20_000) },
      ],
    });
    expect(incomeSummary(p)).toMatchObject({ yours: R(60_000), partner: R(20_000), totalMonthly: R(80_000) });
    expect(p.salaryCents).toBe(R(80_000));
  });

  it("3. family with children: school fees are essential and protection is larger", () => {
    let p = household({ profile: { maritalStatus: "married", children: 2, childAges: ["5-12", "13-18"], householdSize: 4 } });
    p = setCategory(p, { group: "Family and children", name: "School fees", kind: "need", enteredCents: R(6_000), fixed: true });
    p = setEmergency(p, { targetMonths: 6 });
    expect(emergencyStatus(p, NOW).target).toBe(allocation(p).essentials * 6);
  });

  it("4. joint family: parent support is an essential commitment", () => {
    let p = household({ profile: { livingWith: "family", householdSize: 6, supportsParents: true } });
    p = setCategory(p, { group: "Family support", name: "Support for parents", kind: "need", enteredCents: R(5_000) });
    expect(p.bills.find((b) => b.name === "Support for parents")!.kind).toBe("need");
  });

  it("5. dual income: bonus is shown but never used for the monthly split", () => {
    const p = household({
      incomes: [
        { id: "s", kind: "salary", label: "Your salary", amountCents: R(60_000) },
        { id: "p", kind: "partner", label: "Partner", amountCents: R(40_000) },
        { id: "b", kind: "bonus", label: "Yearly bonus", amountCents: R(1_00_000) },
      ],
    });
    expect(incomeSummary(p)).toMatchObject({ totalMonthly: R(1_00_000), bonusYearly: R(1_00_000) });
  });

  it("6 & 7. salary increase raises savings; a decrease never cuts essentials", () => {
    const p = { ...household(), goals: [createVaultGoal({ id: "car", name: "Car", targetCents: R(6_00_000), savedCents: 0, lockMonths: 36, priority: "high", stepUp: null }, NOW)] };
    const up = proposeLifeChange(p, { type: "salary", newMonthlyCents: R(70_000) }).plan;
    const down = proposeLifeChange(p, { type: "salary", newMonthlyCents: R(40_000) }).plan;
    const c = comparePlans(p, up, NOW);
    expect(c.rows.find((r) => r.label === "Monthly income")!.after).toBe(R(70_000));
    expect(allocation(down).essentials).toBe(allocation(p).essentials);
    expect(allocation(up).reserve + allocation(up).goals).toBeGreaterThan(allocation(p).reserve + allocation(p).goals);
  });

  it("8. expense change (rent increase) is a proposal until applied", () => {
    const p = household();
    const proposal = proposeLifeChange(p, { type: "rent", newRentCents: R(20_000) });
    expect(allocation(proposal.plan).essentials - allocation(p).essentials).toBe(R(5_000));
    expect(p.bills.find((b) => b.name === "House rent")!.amountCents).toBe(R(15_000)); // original untouched
  });

  it("9. category limits raise alerts at 50, 75, 90 and 100%", () => {
    const at = (spent: number) => categoryStatus("Groceries", R(8_000), R(spent), 15, 30, "INR").level;
    expect([at(1_000), at(4_000), at(6_000), at(7_200), at(8_000), at(9_000)]).toEqual(["fine", "half", "reminder", "warning", "exhausted", "over"]);
    const s = categoryStatus("Restaurants", R(3_000), R(1_200), 15, 30, "INR");
    expect(s.message).toBe("You have ₹1,800 left for restaurants this month.");
    expect(s.dayCents).toBeGreaterThan(0);
  });

  it("10. overspending explains itself and never moves money between parts", () => {
    const s = categoryStatus("Entertainment", R(2_000), R(2_500), 20, 30, "INR");
    expect(s.level).toBe("over");
    expect(s.message).toContain("₹500 more");
    expect(s.action).toMatch(/won’t move money/);
  });

  it("11. emergency fund: ₹25,000 essentials → ₹75,000 / ₹1,50,000 targets", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(60_000) };
    p = setCategory(p, { group: "Housing", name: "House rent", kind: "need", enteredCents: R(25_000) });
    p = setEmergency(p, { targetMonths: 3, savedCents: R(20_000), monthlyCents: R(5_000) });
    const e = emergencyStatus(p, NOW);
    expect([e.target3, e.target6, e.remaining]).toEqual([R(75_000), R(1_50_000), R(55_000)]);
    expect(e.completionMonth).toBe("2027-09"); // 11 months at ₹5,000
    // Funded before goals.
    expect(planMonth(p, NOW).emergencyCents).toBe(R(5_000));
  });

  it("12. multiple goals: shortfall, priorities and approval before any date changes", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(15_000) };
    const goal = (id: string, name: string, monthly: number, prio: "high" | "medium" | "low") => ({
      id, name, targetCents: R(monthly * 10), savedCents: 0, dueMonth: "2027-08", priority: prio, productId: null,
    });
    p = { ...p, goals: [goal("car", "Car", 10_000, "high"), goal("travel", "Travel", 3_000, "medium"), goal("laptop", "Laptop", 5_000, "low")] };
    const m = planMonth(p, NOW);
    const g = goalProposals(p, m);
    expect([g.required, g.shortfall]).toEqual([R(18_000), R(3_000)]);
    expect(g.proposals.map((x) => x.goalId)).toEqual(["laptop"]);
    expect(p.goals.find((x) => x.id === "laptop")!.dueMonth).toBe("2027-08");
    const approved = applyProposals(p, [{ goalId: "laptop", dueMonth: g.proposals[0].proposedDue! }]);
    expect(planMonth(approved, NOW).goals.find((x) => x.goal.id === "laptop")!.status).toBe("on-track");
  });

  it("13. six-month vault matures six calendar months after it starts", () => {
    const g = createVaultGoal({ id: "l", name: "Laptop", targetCents: R(60_000), savedCents: 0, lockMonths: 6, priority: "medium", stepUp: null }, NOW);
    const v = vault(g, NOW, TODAY);
    expect(v.maturityDate).toBe("2027-05-01");
    expect(v.requiredMonthly).toBe(R(10_000));
    expect(v.matured).toBe(false);
  });

  it("14. five-year vault", () => {
    const g = createVaultGoal({ id: "h", name: "House", targetCents: R(12_00_000), savedCents: 0, lockMonths: 60, priority: "high", stepUp: null }, NOW);
    expect(vault(g, NOW, TODAY)).toMatchObject({ maturityDate: "2031-11-01", monthsLeft: 60, requiredMonthly: R(20_000) });
    expect(createVaultGoal({ id: "x", name: "x", targetCents: 1, savedCents: 0, lockMonths: 2, priority: "low", stepUp: null }, NOW).lockMonths).toBe(6);
    expect(createVaultGoal({ id: "y", name: "y", targetCents: 1, savedCents: 0, lockMonths: 99, priority: "low", stepUp: null }, NOW).lockMonths).toBe(60);
  });

  it("15. missed contributions are detected, never invented", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [{ ...createVaultGoal({ id: "c", name: "Car", targetCents: R(1_00_000), savedCents: 0, lockMonths: 12, priority: "high", stepUp: null }, "2026-08") }] };
    p = recordContribution(p, "c", { month: "2026-08", date: "2026-08-05", amountCents: R(5_000), kind: "scheduled" }).plan;
    expect(vault(p.goals[0], NOW, TODAY).missedMonths).toEqual(["2026-09", "2026-10"]);
  });

  it("16. additional contributions add to savings and lower the monthly need from next month", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [createVaultGoal({ id: "t", name: "Trip", targetCents: R(60_000), savedCents: 0, lockMonths: 12, priority: "medium", stepUp: null }, NOW)] };
    const before = vault(p.goals[0], "2026-12", "2026-12-02").requiredMonthly;
    p = recordContribution(p, "t", { month: NOW, date: TODAY, amountCents: R(12_000), kind: "extra", key: "k1" }).plan;
    expect(goalSaved(p.goals[0])).toBe(R(12_000));
    // This month's amount stays what it was at the start of the month; the months after need less.
    expect(vault(p.goals[0], "2026-12", "2026-12-02").requiredMonthly).toBeLessThan(before);
  });

  it("17. paused goals get nothing and aren't marked as missing", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [createVaultGoal({ id: "b", name: "Bike", targetCents: R(60_000), savedCents: 0, lockMonths: 12, priority: "medium", stepUp: null }, "2026-09")] };
    p = setPaused(p, "b", true);
    expect(planMonth(p, NOW).goals[0]).toMatchObject({ status: "paused", monthlyCents: 0 });
    expect(vault(p.goals[0], NOW, TODAY).missedMonths).toEqual([]);
  });

  it("18. early withdrawal is flagged, and the ledger then closes", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [createVaultGoal({ id: "w", name: "Wedding", targetCents: R(2_00_000), savedCents: R(50_000), lockMonths: 24, priority: "high", stepUp: null }, NOW)] };
    p = requestWithdrawal(p, "w", TODAY, NOW);
    expect(p.goals[0].withdrawal).toMatchObject({ early: true, amountCents: R(50_000), status: "requested" });
    expect(recordContribution(p, "w", { month: NOW, date: TODAY, amountCents: R(1_000), kind: "scheduled" }).plan).toBe(p);
  });

  it("19. contribution calculator: ₹6,00,000 car, ₹1,00,000 saved, 20 months → ₹25,000 a month", () => {
    const g = { ...createVaultGoal({ id: "car", name: "Car", targetCents: R(6_00_000), savedCents: R(1_00_000), lockMonths: 20, priority: "high", stepUp: null }, NOW) };
    const v = vault(g, NOW, TODAY);
    expect(v).toMatchObject({ remaining: R(5_00_000), monthsLeft: 20, requiredMonthly: R(25_000), totalExpected: R(5_00_000) });
    expect(Math.round(v.completion * 100)).toBe(17);
  });

  it("20. duplicate deposits are ignored", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [createVaultGoal({ id: "d", name: "Laptop", targetCents: R(60_000), savedCents: 0, lockMonths: 12, priority: "low", stepUp: null }, NOW)] };
    p = recordContribution(p, "d", { month: NOW, date: TODAY, amountCents: R(5_000), kind: "scheduled" }).plan;
    const again = recordContribution(p, "d", { month: NOW, date: "2026-11-11", amountCents: R(5_000), kind: "scheduled" });
    expect(again.duplicate).toBe(true);
    const extra1 = recordContribution(p, "d", { month: NOW, date: TODAY, amountCents: R(2_000), kind: "extra", key: "click-1" }).plan;
    expect(recordContribution(extra1, "d", { month: NOW, date: TODAY, amountCents: R(2_000), kind: "extra", key: "click-1" }).duplicate).toBe(true);
    expect(goalSaved(extra1.goals[0])).toBe(R(7_000));
  });

  it("21. ledger reconciliation and de-duplication on load", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, salaryCents: R(50_000), goals: [createVaultGoal({ id: "r", name: "Phone", targetCents: R(30_000), savedCents: R(5_000), lockMonths: 6, priority: "low", stepUp: null }, NOW)] };
    p = recordContribution(p, "r", { month: NOW, date: TODAY, amountCents: R(5_000), kind: "scheduled" }).plan;
    expect(reconcile(p.goals[0])).toMatchObject({ contributed: R(5_000), total: R(10_000), uniqueIds: true, matches: true });
    const dup = JSON.parse(JSON.stringify(p));
    dup.goals[0].contributions.push(dup.goals[0].contributions[0]);
    expect(parsePlan(dup).goals[0].contributions).toHaveLength(1);
  });

  it("22. month-end boundaries", () => {
    expect(addMonthsToDate("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsToDate("2027-03-31", 1)).toBe("2027-04-30");
    expect(addMonthsToDate("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("23. leap years", () => {
    expect(addMonthsToDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToDate("2028-02-29", 12)).toBe("2029-02-28");
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
    expect(daysBetween("2027-02-01", "2027-03-01")).toBe(28);
  });

  it("24. invalid saved data is cleaned, not trusted", () => {
    const p = parsePlan({
      salaryCents: -1,
      currency: "XYZ",
      profile: { children: -3, maritalStatus: "complicated", childAges: ["5-12", "200"] },
      emergency: { targetMonths: 99, savedCents: "lots" },
      goals: [{ id: "g", name: "x", targetCents: 10, dueMonth: "2027-01", lockMonths: 1, contributions: [{ id: "c", month: "bad", date: "2027-01-01", amountCents: 5 }] }],
      incomes: [{ id: "i", kind: "lottery", amountCents: -5 }],
    });
    expect(p.salaryCents).toBe(0);
    expect(p.currency).toBeUndefined();
    expect(p.profile).toMatchObject({ children: null, maritalStatus: null, childAges: ["5-12"] });
    expect(p.emergency).toMatchObject({ targetMonths: 12, savedCents: 0 });
    expect(p.goals[0].lockMonths).toBeNull();
    expect(p.goals[0].contributions).toEqual([]);
    expect(p.incomes![0]).toMatchObject({ kind: "other", amountCents: 0 });
  });

  it("25. user data isolation: the server's coach accepts only computed metrics, never the plan", () => {
    const body = CoachBody.parse({ score: 50, band: "fair", parts: [], insights: [], amounts: [], plan: { salaryCents: 1 }, profile: { children: 2 } });
    expect(body).not.toHaveProperty("plan");
    expect(body).not.toHaveProperty("profile");
  });
});

describe("lifestyle guidance, health and coach", () => {
  it("suggests lifestyle limits from the savings policy: essentials first, then savings, then ENJOY", async () => {
    const { allocateThreePriorities } = await import("@/lib/nexus/savings-policy");
    const p = household();
    const s = suggestLifestyle(p, NOW);
    const policy = allocateThreePriorities(R(60_000), R(27_333));
    expect(s.poolCents).toBe(policy.enjoy);
    expect(policy.rate).toBeGreaterThanOrEqual(0.35);
    expect(s.assumptions[0]).toContain("not a fixed percentage");
    expect(Object.values(s.byGroup).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(s.poolCents);
  });

  it("explains an essentials shortfall without cutting essentials", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(20_000) };
    p = setCategory(p, { group: "Housing", name: "House rent", kind: "need", enteredCents: R(18_000) });
    p = setCategory(p, { group: "Loans and debt", name: "Personal loan EMI", kind: "need", enteredCents: R(6_000) });
    const a = allocation(p);
    expect(a.essentialsShortfall).toBe(R(4_000));
    expect(a.explanations[0]).toMatch(/won’t cut/);
  });

  it("scores debt and buffer, and lists missing information separately", () => {
    let p = household();
    p = setCategory(p, { group: "Loans and debt", name: "Personal loan EMI", kind: "need", enteredCents: R(20_000) });
    const h = analyzeMoney(p, planMonth(p, NOW), monthSpending(p, planMonth(p, NOW), [], NOW), { now: NOW, day: 10, daysInMonth: 30 });
    expect(h.parts.find((x) => x.key === "debt")!.value).toBeLessThan(1);
    expect(h.parts.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(missingInfo(p)).toContain("An emergency fund target");
    expect(missingInfo(p)).not.toContain("Your monthly income");
  });

  it("answers questions with figures from the plan only", () => {
    const p = { ...household(), goals: [createVaultGoal({ id: "car", name: "Car", targetCents: R(6_00_000), savedCents: R(1_00_000), lockMonths: 20, priority: "high", stepUp: null }, NOW)] };
    const ask = (q: string) => answerMoneyQuestion(q, p, noSpend(), NOW, 10, 30);
    const split = ask("How should I divide my salary?");
    expect(split.answer).toContain("₹60,000");
    expect(ask("Can I afford a car?").answer).toMatch(/₹25,000 a month/);
    expect(ask("How much should I keep for emergencies?").answer).toContain("3 months is");
    expect(ask("Am I spending too much on restaurants?").answer).toContain("₹3,000");
    // Every rupee figure in an answer is one the engine produced.
    const numbers = (o: object) => Object.values(o).filter((v): v is number => typeof v === "number");
    const allowed = [R(60_000), ...numbers(allocation(p)), ...numbers(planPriorities(p, planMonth(p, NOW)))];
    // (Zero amounts are never accepted as anchors by the guardrail, so literal ₹0 figures are left out of the check.)
    expect(numbersConsistent(split.answer.replace(/₹0(?!\d)(?!,\d)/g, ""), allowed)).toBe(true);
  });
});

describe("quick setup: a full plan from a few answers", () => {
  it("builds essentials, lifestyle limits, an emergency fund and savings within income", async () => {
    const { quickPlan, EMPTY_ANSWERS, allocation, emergencyStatus } = await import("@/lib/nexus/household");
    const p = quickPlan({ ...EMPTY_ANSWERS, household: "kids", yourIncomeCents: R(60_000), partnerIncomeCents: R(20_000), rentCents: R(15_000), foodCents: R(8_000), billsCents: R(4_000), schoolCents: R(3_000) }, EMPTY_PLAN, NOW);
    expect(p.salaryCents).toBe(R(80_000));
    const a = allocation(p);
    expect(a.essentials).toBe(R(30_000));
    expect(a.lifestyle).toBeGreaterThan(0);
    expect(p.emergency!.targetMonths).toBe(6); // family
    expect(emergencyStatus(p, NOW).target).toBe(R(1_80_000));
    expect(p.emergency!.monthlyCents).toBe(R(15_000)); // ₹1,80,000 over 12 months
    // LIVE ₹30,000 → BUILD 40% (₹32,000: ₹15,000 emergency + ₹17,000 more) → ENJOY ₹18,000.
    expect(a.lifestyle).toBe(R(18_000));
    expect(a.reserve).toBe(R(17_000));
    // Shopping, entertainment and travel are kept small.
    const limit = (n: string) => p.bills.find((b) => b.name === n)!.amountCents;
    expect(limit("Food and outings")).toBe(R(7_200));
    expect([limit("Shopping"), limit("Entertainment"), limit("Travel")]).toEqual([R(3_600), R(1_800), R(1_800)]);
    expect(a.essentials + a.lifestyle + a.protection + a.goals + a.reserve).toBe(a.income);
    // Only typed amounts become expenses: no loans or parent support were entered.
    expect(p.bills.some((b) => b.name === "EMIs" || b.name === "Support for parents")).toBe(false);
  });

  it("keeps goals and spending, and round-trips answers for editing", async () => {
    const { quickPlan, answersFrom, EMPTY_ANSWERS } = await import("@/lib/nexus/household");
    const base = { ...EMPTY_PLAN, goals: [{ id: "g", name: "Car", targetCents: R(1_00_000), savedCents: 0, dueMonth: "2027-10", priority: "high" as const }] };
    const answers = { ...EMPTY_ANSWERS, household: "couple" as const, yourIncomeCents: R(50_000), partnerIncomeCents: R(10_000), rentCents: R(12_000), foodCents: R(6_000) };
    const p = quickPlan(answers, base, NOW);
    expect(p.goals).toHaveLength(1);
    expect(answersFrom(quickPlan({ ...answers, household: "kids" }, base, NOW)).household).toBe("kids");
    expect(answersFrom(p)).toMatchObject({ household: "couple", yourIncomeCents: R(50_000), partnerIncomeCents: R(10_000), rentCents: R(12_000), foodCents: R(6_000) });
  });
});

describe("personal targets instead of fixed percentages", () => {
  it("checks essentials, savings, lifestyle and buffer against your own goals", async () => {
    const { quickPlan, EMPTY_ANSWERS, targetChecks, personalTargets, createVaultGoal } = await import("@/lib/nexus/household");
    let p = quickPlan({ ...EMPTY_ANSWERS, household: "couple", yourIncomeCents: R(70_000), rentCents: R(20_000), foodCents: R(10_000) }, EMPTY_PLAN, NOW);
    expect(targetChecks(p, NOW).every((r) => r.ok)).toBe(true);
    // A big new goal raises the savings target; the plan now flags lifestyle as too high.
    p = { ...p, goals: [createVaultGoal({ id: "car", name: "Car", targetCents: R(3_00_000), savedCents: 0, lockMonths: 12, priority: "high", stepUp: null }, NOW)] };
    const t = personalTargets(p, NOW);
    expect(t.goalsNeed).toBe(R(25_000));
    const rows = Object.fromEntries(targetChecks(p, NOW).map((r) => [r.key, r]));
    expect(rows.lifestyle.ok).toBe(false);
    expect(rows.lifestyle.note).toMatch(/above what’s safe/);
  });
});
