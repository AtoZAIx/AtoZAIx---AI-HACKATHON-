import { describe, expect, it } from "vitest";
import { completionReward, createVaultGoal, reachedOn, recordContribution } from "@/lib/nexus/household";
import { EMPTY_PLAN, type Goal } from "@/lib/nexus/budget";

const R = (rupees: number) => rupees * 100;
/** A 12-month car fund started in Nov 2026: unlocks 1 Nov 2027. */
const car = (saved = 0): Goal => createVaultGoal({ id: "car", name: "Car", targetCents: R(100_000), savedCents: R(saved), lockMonths: 12, priority: "medium", stepUp: null }, "2026-11");

function save(goal: Goal, entries: Array<[string, number]>): Goal {
  let plan = { ...EMPTY_PLAN, goals: [goal] };
  for (const [date, rupees] of entries) plan = recordContribution(plan, goal.id, { month: date.slice(0, 7), date, amountCents: R(rupees), kind: "extra" }).plan;
  return plan.goals[0];
}

describe("completion reward for finishing a goal within its lock-in", () => {
  it("is on track while there's still time, showing what's left and the deadline", () => {
    expect(completionReward(car(20_000), "2026-12", "2026-12-15")).toEqual({ status: "on-track", byDate: "2027-11-01", remainingCents: R(80_000) });
  });

  it("is earned when the target is reached before the lock-in ends, and paid at maturity", () => {
    const g = save(car(20_000), [
      ["2027-02-10", 50_000],
      ["2027-06-05", 30_000],
    ]);
    expect(reachedOn(g)).toBe("2027-06-05");
    expect(completionReward(g, "2027-07", "2027-07-01")).toEqual({ status: "earned", reachedOn: "2027-06-05", paysOn: "2027-11-01" });
    // Still earned after maturity, including when the savings are withdrawn on time.
    expect(completionReward({ ...g, withdrawal: { requestedAt: "2027-11-02T00:00:00Z", early: false, amountCents: R(100_000), feeCents: 0, status: "requested" } }, "2027-11", "2027-11-02")?.status).toBe("earned");
  });

  it("is missed when the lock-in ends before the goal is complete", () => {
    const g = save(car(20_000), [["2027-03-01", 40_000]]);
    expect(completionReward(g, "2027-11", "2027-11-02")).toEqual({ status: "missed", maturityDate: "2027-11-01" });
  });

  it("is lost when the lock is broken early, even if the target was reached", () => {
    const g = save(car(20_000), [["2027-02-10", 80_000]]);
    const broken = { ...g, withdrawal: { requestedAt: "2027-03-01T00:00:00Z", early: true, amountCents: R(100_000), feeCents: R(7_000), status: "requested" as const } };
    expect(completionReward(broken, "2027-03", "2027-03-01")).toEqual({ status: "lost" });
  });

  it("never states an amount: it's set from market rates at the time", () => {
    const r = completionReward(save(car(20_000), [["2027-02-10", 80_000]]), "2027-03", "2027-03-01")!;
    expect(Object.keys(r)).not.toContain("amountCents");
    expect(completionReward({ ...car(), lockMonths: null }, "2026-11", "2026-11-12")).toBeNull();
  });
});
