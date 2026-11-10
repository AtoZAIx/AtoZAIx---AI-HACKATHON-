import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, parsePlan, planMonth, type MoneyPlan } from "@/lib/nexus/budget";
import { allocation, answersFrom, EMPTY_ANSWERS, personalIncome, quickPlan, setCategory } from "@/lib/nexus/household";
import { allocateThreePriorities, buildPots, planPriorities, SAVINGS_POLICY } from "@/lib/nexus/savings-policy";

const R = (rupees: number) => rupees * 100;
const NOW = "2026-11";

describe("LIVE · ENJOY · BUILD savings policy", () => {
  it("1. ₹30,000 with ₹15,000 essentials: the reference plan, 40% saved", () => {
    const r = allocateThreePriorities(R(30_000), R(15_000));
    expect(r).toMatchObject({ live: R(15_000), enjoy: R(3_000), build: R(12_000), unassigned: 0, shortfall: 0, status: "preferred" });
    expect(r.rate).toBeCloseTo(0.4);
    expect(r.build * 12).toBe(R(1_44_000)); // yearly
  });

  it("2. ₹15,000 with ₹11,000 essentials: saves what's genuinely affordable and says why", () => {
    const r = allocateThreePriorities(R(15_000), R(11_000));
    // 30% (₹4,500) would leave less than 5% to live on, so the most is ₹3,250, keeping ₹750.
    expect(r).toMatchObject({ build: R(3_250), enjoy: R(750), status: "below" });
    expect(r.explanation).toMatch(/real costs, not your choices/);
  });

  it("3. ₹50,000 with ₹29,000 essentials: 30–35% fallback, ENJOY kept at 10%", () => {
    const r = allocateThreePriorities(R(50_000), R(29_000));
    expect(r).toMatchObject({ build: R(16_000), enjoy: R(5_000), status: "fallback" });
    expect(r.rate).toBeCloseTo(0.32);
  });

  it("4. ₹1,00,000: a family with ₹57,000 essentials, and a single person with ₹20,000", () => {
    expect(allocateThreePriorities(R(1_00_000), R(57_000))).toMatchObject({ build: R(33_000), enjoy: R(10_000), status: "fallback" });
    // Low essentials: savings go up to 45%, ENJOY is capped at 25%, the rest is left for the user to decide.
    expect(allocateThreePriorities(R(1_00_000), R(20_000))).toMatchObject({ build: R(45_000), enjoy: R(25_000), unassigned: R(10_000), status: "preferred" });
  });

  it("5. essentials above income: shows the shortfall, saves nothing, cuts nothing", () => {
    const r = allocateThreePriorities(R(20_000), R(24_000));
    expect(r).toMatchObject({ live: R(24_000), build: 0, enjoy: 0, shortfall: R(4_000), status: "shortfall" });
    expect(r.explanation).toMatch(/won’t cut rent/);
  });

  it("6–7. below 30%, 30–35% and 35–45% are told apart", () => {
    const status = (live: number) => allocateThreePriorities(R(1_00_000), R(live)).status;
    expect([status(40_000), status(58_000), status(70_000)]).toEqual(["preferred", "fallback", "below"]);
  });

  it("8. never saves more than 50%, even when it could", () => {
    const r = allocateThreePriorities(R(1_00_000), 0);
    expect(r.build).toBeLessThanOrEqual(R(50_000));
    expect(r.build).toBe(R(45_000));
    // A plan whose goals ask for 60%: savings stop at 50% and the excess is flagged, never forced.
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(1_00_000) };
    p = setCategory(p, { group: "Housing", name: "Rent", kind: "need", enteredCents: R(10_000) });
    p = { ...p, goals: [{ id: "g", name: "House", targetCents: R(60_000), savedCents: 0, dueMonth: NOW, priority: "high" }] };
    const pr = planPriorities(p, planMonth(p, NOW));
    expect(pr.build).toBe(R(50_000));
    expect(pr.overCeiling).toBe(R(10_000));
  });

  it("9. multiple incomes are added once", () => {
    const p = quickPlan({ ...EMPTY_ANSWERS, household: "couple", yourIncomeCents: R(50_000), partnerIncomeCents: R(20_000), rentCents: R(15_000) }, EMPTY_PLAN, NOW);
    expect(p.salaryCents).toBe(R(70_000));
    expect(p.incomes).toHaveLength(2);
  });

  it("10. business income counts only after operating costs and tax, and round-trips for editing", () => {
    const answers = { ...EMPTY_ANSWERS, earning: "business" as const, yourIncomeCents: R(1_00_000), businessCostsCents: R(40_000), rentCents: R(12_000) };
    expect(personalIncome(answers)).toBe(R(60_000));
    const p = quickPlan(answers, EMPTY_PLAN, NOW);
    expect(p.salaryCents).toBe(R(60_000)); // never the ₹1,00,000 turnover
    expect(p.profile?.employment).toBe("business");
    expect(answersFrom(p)).toMatchObject({ earning: "business", yourIncomeCents: R(1_00_000), businessCostsCents: R(40_000) });
    expect(personalIncome({ earning: "freelance", yourIncomeCents: R(10_000), businessCostsCents: R(15_000) })).toBe(0);
  });

  it("11. a new EMI or higher rent lowers ENJOY and savings, never the essentials", () => {
    const base = { ...EMPTY_ANSWERS, yourIncomeCents: R(60_000), rentCents: R(15_000), foodCents: R(6_000) };
    const before = allocation(quickPlan(base, EMPTY_PLAN, NOW));
    const after = allocation(quickPlan({ ...base, loansCents: R(8_000), rentCents: R(18_000) }, EMPTY_PLAN, NOW));
    expect(after.essentials).toBe(R(15_000 + 3_000 + 6_000 + 8_000));
    expect(after.lifestyle).toBeLessThan(before.lifestyle);
    expect(after.protection + after.goals + after.reserve).toBeLessThan(before.protection + before.goals + before.reserve);
  });

  it("12. a family gets a 6-month emergency fund and a children’s education pot", () => {
    const answers = { ...EMPTY_ANSWERS, yourIncomeCents: R(80_000), rentCents: R(20_000), foodCents: R(10_000) };
    const single = quickPlan(answers, EMPTY_PLAN, NOW);
    const kids = quickPlan({ ...answers, household: "kids" }, EMPTY_PLAN, NOW);
    expect([single.emergency!.targetMonths, kids.emergency!.targetMonths]).toEqual([3, 6]);
    const pots = (p: MoneyPlan) => buildPots(planPriorities(p, planMonth(p, NOW)).build, planMonth(p, NOW).emergencyCents, 0, (p.profile?.children ?? 0) > 0).map((x) => x.key);
    expect(pots(single)).not.toContain("children");
    expect(pots(kids)).toContain("children");
  });

  it("13. goals and the emergency fund are paid from BUILD first, in separate pots", () => {
    const pots = buildPots(R(12_000), R(3_750), R(2_000), false);
    expect(pots.find((p) => p.key === "emergency")!.cents).toBe(R(3_750));
    expect(pots.find((p) => p.key === "goals")!.cents).toBe(R(2_000));
    expect(pots.reduce((s, p) => s + p.cents, 0)).toBe(R(12_000));
    // BUILD smaller than the emergency need: nothing is invented.
    expect(buildPots(R(1_000), R(3_750), R(2_000), true).reduce((s, p) => s + p.cents, 0)).toBe(R(1_000));
  });

  it("14. every split reconciles exactly with income, with no negatives and never above 50%", () => {
    for (const income of [0, 5_000, 15_000, 30_000, 50_000, 1_00_000, 3_00_000]) {
      for (const share of [0, 0.2, 0.37, 0.5, 0.63, 0.8, 0.95, 1, 1.2]) {
        const r = allocateThreePriorities(R(income), Math.round(R(income) * share));
        for (const v of [r.live, r.enjoy, r.build, r.unassigned, r.shortfall]) expect(v).toBeGreaterThanOrEqual(0);
        if (r.shortfall === 0) expect(r.live + r.enjoy + r.build + r.unassigned).toBe(r.income);
        expect(r.build).toBeLessThanOrEqual(Math.floor(r.income * SAVINGS_POLICY.ceiling));
      }
    }
    // And for a full plan built by the quick setup.
    const p = quickPlan({ ...EMPTY_ANSWERS, household: "joint", yourIncomeCents: R(50_000), partnerIncomeCents: R(50_000), rentCents: R(20_000), foodCents: R(12_000), billsCents: R(5_000), loansCents: R(10_000), schoolCents: R(5_000), parentsCents: R(5_000) }, EMPTY_PLAN, NOW);
    const pr = planPriorities(p, planMonth(p, NOW));
    expect(pr.live + pr.enjoy + pr.build + pr.unassigned).toBe(pr.income);
    expect(pr.status).toBe("fallback");
  });

  it("15. invalid or missing input never breaks the plan", () => {
    expect(allocateThreePriorities(Number.NaN, -5)).toMatchObject({ income: 0, build: 0, enjoy: 0, status: "none" });
    expect(allocateThreePriorities(R(30_000), Number.POSITIVE_INFINITY).live).toBe(0);
    const parsed = parsePlan({ salaryCents: R(10_000), incomes: [{ id: "a", kind: "salary", amountCents: R(10_000), grossCents: "lots", costsCents: -4 }], profile: { employment: "pirate" } });
    expect(parsed.incomes![0]).toMatchObject({ grossCents: 0, costsCents: 0 });
    expect(parsed.profile!.employment).toBeNull();
  });

  it("tells you how much to trim ENJOY to reach 30%, when that's possible", () => {
    let p = quickPlan({ ...EMPTY_ANSWERS, yourIncomeCents: R(50_000), rentCents: R(15_000), foodCents: R(5_000) }, EMPTY_PLAN, NOW);
    p = setCategory(p, { group: "Shopping", name: "Shopping", kind: "want", enteredCents: R(20_000) });
    const pr = planPriorities(p, planMonth(p, NOW));
    expect(pr.status).toBe("below");
    expect(pr.toFallback).toBeGreaterThan(0);
    expect(pr.explanation).toMatch(/would bring savings to 30%/);
  });

  it("the coach explains the savings rate from the engine’s own numbers", async () => {
    const { answerMoneyQuestion } = await import("@/lib/nexus/money-questions");
    const p = quickPlan({ ...EMPTY_ANSWERS, yourIncomeCents: R(30_000), rentCents: R(4_000), foodCents: R(4_000), billsCents: R(3_500), medicalCents: R(1_000), loansCents: R(2_500) }, EMPTY_PLAN, NOW);
    const spending = { byBill: new Map<string, number>(), freeLoggedCents: 0, purchasesCents: 0, goalPurchases: [], freeSpentCents: 0, freeLeftCents: 0 };
    const ask = (q: string) => answerMoneyQuestion(q, p, spending, NOW, 10, 30).answer;
    expect(ask("Why is my savings rate 40%?")).toContain("40%");
    expect(ask("How can I save 40%?")).toMatch(/already save 40%/);
    expect(ask("How much can I spend this week?")).toMatch(/this week/);
    expect(ask("What happens if my salary increases by ₹5,000?")).toContain("₹35,000");
    expect(ask("How should I divide my salary?")).toMatch(/LIVE ₹15,000.*ENJOY ₹3,000.*BUILD ₹12,000/);
  });

  it("emergency fund: at least 7–9% of income by family size, more when needed, never above BUILD", async () => {
    const { emergencyRate, emergencyMonthsFor, familyCounts } = await import("@/lib/nexus/household");
    expect([1, 2, 3, 4, 5, 7].map(emergencyRate)).toEqual([0.07, 0.07, 0.08, 0.08, 0.09, 0.09]);
    expect([emergencyMonthsFor(1, 0), emergencyMonthsFor(2, 0), emergencyMonthsFor(3, 1), emergencyMonthsFor(4, 0)]).toEqual([3, 3, 6, 6]);
    // No costs entered yet: still 7–9%, never ₹0.
    const noCosts = (household: "single" | "kids" | "joint", adults: number, children: number) =>
      quickPlan({ ...EMPTY_ANSWERS, household, adults, children, yourIncomeCents: R(45_000) }, EMPTY_PLAN, NOW).emergency!.monthlyCents;
    expect(noCosts("single", 1, 0)).toBe(R(3_150)); // 7%
    expect(noCosts("kids", 2, 2)).toBe(R(3_600)); // family of 4: 8%
    expect(noCosts("joint", 4, 2)).toBe(R(4_050)); // family of 6: 9%
    // Counts follow the household type.
    expect(familyCounts({ household: "single", adults: 5, children: 3 })).toEqual({ adults: 1, children: 0, size: 1 });
    expect(familyCounts({ household: "kids", adults: 2, children: 0 })).toEqual({ adults: 2, children: 1, size: 3 });
    expect(familyCounts({ household: "joint", adults: Number.NaN, children: -2 })).toEqual({ adults: 3, children: 0, size: 3 });
  });

  it("stores the family count and round-trips it for editing", () => {
    const p = quickPlan({ ...EMPTY_ANSWERS, household: "kids", adults: 2, children: 3, yourIncomeCents: R(90_000), rentCents: R(20_000) }, EMPTY_PLAN, NOW);
    expect(p.profile).toMatchObject({ householdSize: 5, children: 3 });
    expect(answersFrom(p)).toMatchObject({ household: "kids", adults: 2, children: 3 });
  });

  it("children’s education grows with each child, up to 35% of the extra savings", () => {
    const share = (kids: number) => buildPots(R(10_000), 0, 0, kids).find((x) => x.key === "children")?.cents ?? 0;
    expect([share(0), share(1), share(2), share(3)]).toEqual([0, R(1_500), R(3_000), R(3_500)]);
  });

  it("setup asks Rent and EMIs separately, both on auto-pay, and turns picked goals into lock-in plans", () => {
    const p = quickPlan(
      {
        ...EMPTY_ANSWERS,
        yourIncomeCents: R(80_000),
        rentCents: R(15_000),
        loansCents: R(10_000),
        goals: [
          { kind: "house", name: "House", targetCents: R(12_00_000), savedCents: R(2_00_000), lockMonths: 60 },
          { kind: "car", name: "Car", targetCents: 0, savedCents: 0, lockMonths: 24 }, // no amount: skipped
        ],
      },
      EMPTY_PLAN,
      NOW,
    );
    const bill = (n: string) => p.bills.find((b) => b.name === n)!;
    expect([bill("Rent").amountCents, bill("EMIs").amountCents]).toEqual([R(15_000), R(10_000)]);
    expect([bill("Rent").autoPay?.day, bill("EMIs").autoPay?.day]).toEqual([1, 5]);
    expect(p.goals.map((g) => [g.name, g.lockMonths, g.startMonth, g.priority, g.savedCents])).toEqual([["House", 60, NOW, "high", R(2_00_000)]]);
    // Editing keeps existing goals; the setup only adds new ones.
    const again = quickPlan({ ...answersFrom(p), goals: [{ kind: "bike", name: "Bike", targetCents: R(1_20_000), savedCents: 0, lockMonths: 12 }] }, p, NOW);
    expect(again.goals.map((g) => g.name)).toEqual(["House", "Bike"]);
    expect(answersFrom(again)).toMatchObject({ rentCents: R(15_000), loansCents: R(10_000), goals: [] });
  });

  it("older plans with ‘Rent or home EMI’ keep their bill, its id and their answers", () => {
    let old: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(50_000), profile: { maritalStatus: "single" }, incomes: [{ id: "inc-salary", kind: "salary", label: "Pay", amountCents: R(50_000) }] };
    old = setCategory(old, { group: "Housing", name: "Rent or home EMI", kind: "need", enteredCents: R(12_000), fixed: true });
    old = setCategory(old, { group: "Loans and debt", name: "Loan EMIs", kind: "need", enteredCents: R(3_000), fixed: true });
    const a = answersFrom(old);
    expect([a.rentCents, a.loansCents]).toEqual([R(12_000), R(3_000)]);
    const next = quickPlan(a, old, NOW);
    expect(next.bills.find((b) => b.name === "Rent")!.id).toBe(old.bills.find((b) => b.name === "Rent or home EMI")!.id);
  });

  it("older plans saved with ₹0 for the emergency fund still get the 7–9% floor, until the fund is full", () => {
    const old: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(45_000), profile: { maritalStatus: "married", children: 1 }, emergency: { targetMonths: 6, savedCents: 0, monthlyCents: 0 } };
    expect(planMonth(old, NOW).emergencyCents).toBe(R(3_600)); // family of 3: 8%
    const withRent = setCategory(old, { group: "Housing", name: "Rent", kind: "need", enteredCents: R(10_000) });
    const full = { ...withRent, emergency: { targetMonths: 6, savedCents: R(60_000), monthlyCents: 0 } };
    expect(planMonth(full, NOW).emergencyCents).toBe(0); // 6 × ₹10,000 already saved
    const nearlyFull = { ...withRent, emergency: { targetMonths: 6, savedCents: R(59_000), monthlyCents: 0 } };
    expect(planMonth(nearlyFull, NOW).emergencyCents).toBe(R(1_000)); // never more than it still needs
  });

  it("goals get at least 10% of monthly income, more when they need it", async () => {
    const { goalFloor } = await import("@/lib/nexus/budget");
    const goal = (id: string, target: number, due: string, priority: "high" | "medium" | "low" = "medium") => ({ id, name: id, targetCents: R(target), savedCents: 0, dueMonth: due, priority });
    const base: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(50_000) };
    // Needs ₹500 a month → gets the ₹5,000 minimum (10%) and finishes sooner.
    const small = planMonth({ ...base, goals: [goal("Phone", 6_000, "2027-10")] }, NOW);
    expect(small.goals[0]).toMatchObject({ neededCents: R(500), monthlyCents: R(5_000), status: "on-track" });
    // Needs ₹20,000 → gets ₹20,000 (more than 10%).
    expect(planMonth({ ...base, goals: [goal("Car", 2_40_000, "2027-10")] }, NOW).goals[0].monthlyCents).toBe(R(20_000));
    // The top-up goes to the most important goal first.
    const two = planMonth({ ...base, goals: [goal("Trip", 1_200, "2027-10", "low"), goal("Laptop", 12_000, "2027-10", "high")] }, NOW);
    expect(two.goalsCents).toBe(R(5_000));
    expect(two.goals.find((g) => g.goal.id === "Laptop")!.monthlyCents).toBeGreaterThan(two.goals.find((g) => g.goal.id === "Laptop")!.neededCents);
    // Never more than a goal still needs; a chosen amount is kept; no open goals → no minimum.
    expect(planMonth({ ...base, goals: [goal("Gift", 2_000, "2027-10")] }, NOW).goals[0].monthlyCents).toBe(R(2_000));
    expect(planMonth({ ...base, goals: [{ ...goal("Phone", 6_000, "2027-10"), chosenMonthlyCents: R(700) }] }, NOW).goals[0].monthlyCents).toBe(R(700));
    expect(goalFloor(R(50_000), [])).toBe(0);
    expect(goalFloor(R(50_000), [{ ...goal("Done", 1_000, "2027-10"), savedCents: R(1_000) }])).toBe(0);
  });
});
