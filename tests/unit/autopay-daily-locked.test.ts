import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, parsePlan, planMonth, type MoneyPlan } from "@/lib/nexus/budget";
import { applyAutoPays, createVaultGoal, EMPTY_ANSWERS, nextAutoPay, quickPlan, recordContribution, setAutoPay, setAutoSave, setChosenMonthly, setPaused, todayAllowance, vault } from "@/lib/nexus/household";

const R = (rupees: number) => rupees * 100;
const NOW = "2026-11";

const withRent = (): MoneyPlan => {
  const p = quickPlan({ ...EMPTY_ANSWERS, yourIncomeCents: R(50_000), rentCents: R(12_000), foodCents: R(6_000) }, EMPTY_PLAN, NOW);
  return p;
};
const rentOf = (p: MoneyPlan) => p.bills.find((b) => b.name === "Rent")!;

describe("auto-pay for rent", () => {
  it("is on for rent by default, on the 1st", () => {
    expect(rentOf(withRent()).autoPay).toEqual({ day: 1, lastMonth: null });
  });

  it("records the payment once a month, on or after its day, and never twice", () => {
    const base = withRent();
    let p = setAutoPay(base, rentOf(base).id, 5);
    p = { ...p, bills: p.bills.map((b) => (b.name === "Rent" ? { ...b, id: "rent" } : b)) };
    expect(applyAutoPays(p, "2026-11-04").plan).toBe(p); // before the 5th: nothing
    const first = applyAutoPays(p, "2026-11-05");
    expect(first.recorded).toEqual(["Rent"]);
    expect(first.plan.expenses).toContainEqual(expect.objectContaining({ id: "auto-rent-2026-11", date: "2026-11-05", amountCents: R(12_000) }));
    // Reload, second tab, later the same month: same plan back, no second payment.
    expect(applyAutoPays(first.plan, "2026-11-20").plan).toBe(first.plan);
    // Deleting the entry doesn't bring it back this month.
    const removed = { ...first.plan, expenses: first.plan.expenses.filter((e) => e.id !== "auto-rent-2026-11") };
    expect(applyAutoPays(removed, "2026-11-21").plan).toBe(removed);
    // Next month it runs again.
    const dec = applyAutoPays(first.plan, "2026-12-06").plan;
    expect(dec.expenses.filter((e) => e.id.startsWith("auto-rent-"))).toHaveLength(2);
  });

  it("can be switched off, keeps its setting when the plan is edited, and validates stored data", () => {
    const p = withRent();
    const off = setAutoPay(p, rentOf(p).id, null);
    expect(applyAutoPays(off, "2026-11-30").plan).toBe(off);
    const edited = quickPlan({ ...EMPTY_ANSWERS, yourIncomeCents: R(55_000), rentCents: R(13_000), foodCents: R(6_000) }, off, NOW);
    expect(rentOf(edited).autoPay).toBeNull();
    expect(rentOf(edited).id).toBe(rentOf(off).id); // same bill, so past payments stay linked
    expect(setAutoPay(p, rentOf(p).id, 31).bills.find((b) => b.autoPay)?.autoPay?.day).toBe(28);
    const parsed = parsePlan({ bills: [{ id: "a", name: "Rent", amountCents: 1, autoPay: { day: 40 } }, { id: "b", name: "EMI", amountCents: 1, autoPay: { day: 5, lastMonth: "2026-11" } }] });
    expect(parsed.bills.map((b) => b.autoPay)).toEqual([null, { day: 5, lastMonth: "2026-11" }]);
    // An older plan that never had the setting gets rent auto-pay when its details are next saved.
    const older = parsePlan({ ...JSON.parse(JSON.stringify(p)), bills: p.bills.map((b) => ({ ...b, autoPay: undefined })) });
    expect(rentOf(older).autoPay).toBeUndefined();
    expect(rentOf(quickPlan({ ...EMPTY_ANSWERS, yourIncomeCents: R(50_000), rentCents: R(12_000) }, older, NOW)).autoPay).toEqual({ day: 1, lastMonth: null });
  });

  it("knows the next date", () => {
    expect(nextAutoPay(1, "2026-11-10", "2026-11")).toBe("2026-12-01");
    expect(nextAutoPay(15, "2026-11-10", null)).toBe("2026-11-15");
  });
});

describe("today's spending money, recalculated every day", () => {
  it("shares what's left over the days left, so spending less today means more tomorrow", () => {
    // ₹3,000 for a 30-day month, day 1: ₹100 today.
    expect(todayAllowance(R(3_000), 0, 0, 1, 30)).toMatchObject({ allowanceCents: R(100), leftTodayCents: R(100) });
    // ₹40 spent today: ₹60 left today; from tomorrow ₹2,960 over 29 days = ₹102.
    expect(todayAllowance(R(3_000), R(40), R(40), 1, 30)).toMatchObject({ allowanceCents: R(100), spentTodayCents: R(40), leftTodayCents: R(60), fromTomorrowCents: R(102) });
    // Overspending today shows as negative today and lowers the days after.
    const over = todayAllowance(R(3_000), R(500), R(500), 1, 30);
    expect(over.leftTodayCents).toBe(R(-400));
    expect(over.fromTomorrowCents).toBe(R(86));
    // Earlier spending this month is already out of today's amount.
    expect(todayAllowance(R(3_000), R(1_000), 0, 11, 30).allowanceCents).toBe(R(100)); // ₹2,000 over 20 days
    // Last day of the month: no "tomorrow".
    expect(todayAllowance(R(3_000), R(2_900), 0, 30, 30)).toMatchObject({ allowanceCents: R(100), fromTomorrowCents: 0 });
  });
});

describe("locked savings: minimum ₹1,000 a month, no interest", () => {
  const lock = (target: number, months: number, saved = 0) => createVaultGoal({ id: "g", name: "Bike", targetCents: R(target), savedCents: R(saved), lockMonths: months, priority: "medium", stepUp: null }, NOW);

  it("never asks for less than ₹1,000 a month, unless less is left to save", () => {
    expect(vault(lock(1_20_000, 24), NOW, "2026-11-10").requiredMonthly).toBe(R(5_000)); // above the minimum: unchanged
    expect(vault(lock(6_000, 12), NOW, "2026-11-10").requiredMonthly).toBe(R(1_000)); // ₹500 a month → ₹1,000 minimum
    expect(vault(lock(6_000, 12, 5_400), NOW, "2026-11-10").requiredMonthly).toBe(R(600)); // only ₹600 left
  });

  it("applies the minimum in the monthly plan and to amounts the user types", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(50_000), goals: [lock(6_000, 12)] };
    expect(planMonth(p, NOW).goals[0].neededCents).toBe(R(1_000));
    p = setChosenMonthly(p, "g", R(300));
    expect(p.goals[0].chosenMonthlyCents).toBe(R(300)); // kept as typed…
    expect(planMonth(p, NOW).goals[0].monthlyCents).toBe(R(1_000)); // …but the plan uses ₹1,000
    expect(vault(p.goals[0], NOW, "2026-11-10").minimumMonthly).toBe(R(1_000));
    // Goals without a lock-in keep their own amount.
    const free = { ...p, goals: [{ ...p.goals[0], lockMonths: undefined, chosenMonthlyCents: R(300) }] };
    expect(planMonth(free, NOW).goals[0].monthlyCents).toBe(R(300));
  });

  it("never shows more planned than is left: a small goal finishes early and stays locked", () => {
    const v = vault(lock(1_500, 48, 1_000), NOW, "2026-11-10"); // ₹500 left, 48-month lock
    expect(v).toMatchObject({ requiredMonthly: R(500), totalExpected: R(500), monthsToFinish: 1, monthsLeft: 48 });
  });

  it("adds no interest: at maturity you have exactly what you put in", () => {
    const v = vault(lock(1_20_000, 24, 20_000), NOW, "2026-11-10");
    expect(v.maturityTotal).toBe(R(1_20_000));
    expect(v).not.toHaveProperty("rate");
    expect(v).not.toHaveProperty("projection");
  });
});

describe("auto-save for locked funds", () => {
  const base = (): MoneyPlan => ({
    ...EMPTY_PLAN,
    currency: "INR",
    salaryCents: R(50_000),
    goals: [createVaultGoal({ id: "bike", name: "Bike", targetCents: R(1_20_000), savedCents: 0, lockMonths: 12, priority: "medium", stepUp: null }, NOW)],
  });
  const scheduled = (p: MoneyPlan) => (p.goals[0].contributions ?? []).filter((c) => c.kind === "scheduled");

  it("is on by default for locked goals and records this month's amount once, on its day", () => {
    let p = setAutoSave(base(), "bike", 5);
    expect(applyAutoPays(p, "2026-11-04").plan).toBe(p); // before the 5th
    const r = applyAutoPays(p, "2026-11-05");
    expect(r.recorded).toEqual(["Bike"]);
    p = r.plan;
    expect(scheduled(p)).toEqual([expect.objectContaining({ id: "bike:2026-11", date: "2026-11-05", amountCents: R(10_000), virtual: true })]);
    expect(applyAutoPays(p, "2026-11-20").plan).toBe(p); // never twice in a month
    expect(scheduled(applyAutoPays(p, "2026-12-05").plan)).toHaveLength(2); // next month again
    // Default (never set): on, the 1st.
    expect(applyAutoPays(base(), "2026-11-01").recorded).toEqual(["Bike"]);
  });

  it("doesn't double up a month recorded by hand", () => {
    const manual = recordContribution(base(), "bike", { month: NOW, date: "2026-11-02", amountCents: R(10_000), kind: "scheduled" }).plan;
    const after = applyAutoPays(manual, "2026-11-03").plan;
    expect(scheduled(after)).toHaveLength(1);
    expect(after.goals[0].autoSave?.lastMonth).toBe(NOW);
  });

  it("skips goals that are switched off, paused, unlocked, or have no money free", () => {
    expect(applyAutoPays(setAutoSave(base(), "bike", null), "2026-11-28").recorded).toEqual([]);
    expect(applyAutoPays(setPaused(base(), "bike", true), "2026-11-28").recorded).toEqual([]);
    const unlocked = { ...base(), goals: [{ ...base().goals[0], lockMonths: null }] };
    expect(applyAutoPays(unlocked, "2026-11-28").recorded).toEqual([]);
    const broke = { ...base(), salaryCents: R(5_000), bills: [{ id: "r", name: "Rent", amountCents: R(5_000), kind: "need" as const }] };
    const r = applyAutoPays(broke, "2026-11-28");
    expect(r.recorded).toEqual([]);
    expect(r.plan.goals[0].autoSave?.lastMonth ?? null).toBeNull(); // tries again if money frees up this month
  });

  it("keeps the setting when stored and loaded", () => {
    const off = parsePlan(JSON.parse(JSON.stringify(setAutoSave(base(), "bike", null))));
    expect(off.goals[0].autoSave).toBeNull();
    const day9 = parsePlan(JSON.parse(JSON.stringify(setAutoSave(base(), "bike", 9))));
    expect(day9.goals[0].autoSave).toEqual({ day: 9, lastMonth: null });
    expect(parsePlan(JSON.parse(JSON.stringify(base()))).goals[0].autoSave).toBeUndefined();
  });
});
