import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, goalFloor, planMonth, type MoneyPlan } from "@/lib/nexus/budget";
import { createVaultGoal, recordContribution, setCategory } from "@/lib/nexus/household";

const R = (rupees: number) => rupees * 100;

/** ₹90,000 pay, ₹20,000 rent: 10% for goals is ₹9,000. */
function plan(goals: MoneyPlan["goals"]): MoneyPlan {
  const p = setCategory({ ...EMPTY_PLAN, currency: "INR", salaryCents: R(90_000) }, { group: "Housing", name: "Rent", kind: "need", enteredCents: R(20_000), fixed: true });
  return { ...p, goals };
}
const car = () => createVaultGoal({ id: "car", name: "Car", targetCents: R(1_500), savedCents: 0, lockMonths: 48, priority: "medium", stepUp: { pct: 0.05, every: "month" } }, "2026-11");

describe("10% for goals, when a goal needs less than that", () => {
  it("gives a small goal all it needs this month (₹1,500), not just the ₹1,000 minimum", () => {
    const m = planMonth(plan([car()]), "2026-11");
    expect(goalFloor(R(90_000), [car()])).toBe(R(9_000));
    expect(m.goals[0]).toMatchObject({ monthlyCents: R(1_500), reachMonth: "2026-11" });
  });

  it("after ₹1,000 was saved this month: still ₹1,500 planned (₹500 due), finishing this month, not counting the ₹1,000 twice", () => {
    let p = plan([car()]);
    p = recordContribution(p, "car", { month: "2026-11", date: "2026-11-05", amountCents: R(1_000), kind: "scheduled" }).plan;
    const g = planMonth(p, "2026-11").goals[0];
    expect(g).toMatchObject({ monthlyCents: R(1_500), remainingCents: R(500), reachMonth: "2026-11" });
  });

  it("the rest of the 10% (₹7,500) is kept for goals in the Goals reserve, not moved elsewhere", () => {
    const m = planMonth(plan([car()]), "2026-11");
    expect(m.goalsCents).toBe(R(1_500));
    expect(m.goalReserveCents).toBe(R(7_500));
    expect(m.goalsCents + m.goalReserveCents).toBe(R(9_000));
    expect(m.freeCents).toBe(R(90_000 - 20_000) - m.emergencyCents - R(9_000));
  });

  it("finish month counts from the start of the month for big goals too", () => {
    const house = createVaultGoal({ id: "h", name: "House", targetCents: R(5_00_000), savedCents: 0, lockMonths: 60, priority: "high", stepUp: null }, "2026-11");
    let p = plan([house]);
    const before = planMonth(p, "2026-11").goals[0];
    p = recordContribution(p, "h", { month: "2026-11", date: "2026-11-01", amountCents: before.monthlyCents, kind: "scheduled" }).plan;
    // Paying this month's amount doesn't move the finish month: it was already counted.
    expect(planMonth(p, "2026-11").goals[0].reachMonth).toBe(before.reachMonth);
  });
});

describe("the Goals reserve", () => {
  it("records the month's leftover once, and moves it into a goal (never more than the goal needs)", async () => {
    const { applyGoalReserve, moveFromReserve, createVaultGoal: vaultGoal } = await import("@/lib/nexus/household");
    let p = plan([car()]);
    p = applyGoalReserve(p, "2026-11-05");
    expect(p.goalReserve).toMatchObject({ savedCents: R(7_500) });
    expect(applyGoalReserve(p, "2026-11-20")).toBe(p); // once a month
    // A new house goal starts with the reserve.
    const house = vaultGoal({ id: "h", name: "House", targetCents: R(5_00_000), savedCents: 0, lockMonths: 60, priority: "high", stepUp: null }, "2026-11");
    const moved = moveFromReserve({ ...p, goals: [...p.goals, house] }, "h", "2026-11-21");
    expect(moved.movedCents).toBe(R(7_500));
    expect(moved.plan.goalReserve!.savedCents).toBe(0);
    expect(moved.plan.goals.find((g) => g.id === "h")!.contributions!.at(-1)).toMatchObject({ amountCents: R(7_500), kind: "extra" });
    // Into a goal that needs only ₹500: just ₹500 moves, the rest stays in the reserve.
    let small = plan([car()]);
    small = recordContribution(small, "car", { month: "2026-11", date: "2026-11-01", amountCents: R(1_000), kind: "scheduled" }).plan;
    small = { ...small, goalReserve: { savedCents: R(7_500), entries: [] } };
    const r = moveFromReserve(small, "car", "2026-11-21");
    expect(r.movedCents).toBe(R(500));
    expect(r.plan.goalReserve!.savedCents).toBe(R(7_000));
  });

  it("is kept when the plan is saved and loaded", async () => {
    const { parsePlan } = await import("@/lib/nexus/budget");
    const { applyGoalReserve } = await import("@/lib/nexus/household");
    const p = applyGoalReserve(plan([car()]), "2026-11-05");
    expect(parsePlan(JSON.parse(JSON.stringify(p))).goalReserve).toEqual(p.goalReserve);
  });
});

describe("locked money", () => {
  it("adds up every locked fund and the Goals reserve, with each fund's unlock date", async () => {
    const { applyGoalReserve, lockedMoney } = await import("@/lib/nexus/household");
    let p = plan([car()]);
    p = recordContribution(p, "car", { month: "2026-11", date: "2026-11-01", amountCents: R(1_000), kind: "scheduled" }).plan;
    p = applyGoalReserve(p, "2026-11-05");
    const l = lockedMoney(p, "2026-11", "2026-11-12");
    expect(l.totalCents).toBe(R(1_000) + R(7_500));
    expect(l.items).toEqual([
      { id: "car", name: "Car", savedCents: R(1_000), targetCents: R(1_500), unlocksOn: "2030-11-01", kind: "fund" },
      { id: "reserve", name: "Goals reserve", savedCents: R(7_500), targetCents: null, unlocksOn: null, kind: "reserve" },
    ]);
  });
});
