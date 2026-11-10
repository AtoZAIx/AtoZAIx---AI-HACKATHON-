import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, parsePlan, planMonth, stepUpFirst, stepUpSchedule, type MoneyPlan } from "@/lib/nexus/budget";
import { createVaultGoal, recordContribution, setStepUp, vault } from "@/lib/nexus/household";

const R = (rupees: number) => rupees * 100;
const NOW = "2026-11";
const car = (stepUp?: { pct: number; every: "month" | "year" } | null) =>
  createVaultGoal({ id: "car", name: "Car", targetCents: R(5_00_000), savedCents: 0, lockMonths: 24, priority: "high", ...(stepUp !== undefined ? { stepUp } : {}) }, NOW);

describe("step-up: each payment 5% bigger than the last", () => {
  it("starts lower and grows 5% a month, adding up to exactly the target", () => {
    const monthly = { pct: 0.05, every: "month" as const };
    expect(stepUpFirst(R(5_00_000), 24, monthly)).toBe(R(11_236)); // vs ₹20,834 flat
    const s = stepUpSchedule(R(5_00_000), 24, monthly);
    expect(s).toHaveLength(24);
    expect(s.reduce((t, x) => t + x, 0)).toBe(R(5_00_000));
    expect(s[1]).toBe(R(11_798)); // ₹11,236 + 5%
    for (let i = 1; i < 23; i++) expect(s[i] / s[i - 1]).toBeCloseTo(1.05, 3);
    expect(s[23]).toBeGreaterThan(R(30_000)); // the last payment is about 3× the first
  });

  it("is the default for locked funds, and can be yearly or switched off", () => {
    expect(vault(car(), NOW, "2026-11-10")).toMatchObject({ requiredMonthly: R(11_236), stepUp: { pct: 0.05, every: "month" } });
    expect(vault(car(null), NOW, "2026-11-10")).toMatchObject({ requiredMonthly: R(20_834), stepUp: null });
    const yearly = vault(car({ pct: 0.05, every: "year" }), NOW, "2026-11-10");
    expect(yearly.schedule.slice(0, 12).every((x) => x === yearly.schedule[0])).toBe(true); // flat for the first year
    expect(yearly.schedule[12]).toBe(Math.ceil((yearly.schedule[0] * 1.05) / 100) * 100); // +5% in year two
    const p = setStepUp({ ...EMPTY_PLAN, goals: [car()] }, "car", null);
    expect(p.goals[0].stepUp).toBeNull();
  });

  it("recalculates each month from what's left, so on track means last month + 5%", () => {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "INR", salaryCents: R(2_00_000), goals: [car()] };
    const nov = planMonth(p, NOW).goals[0].neededCents;
    p = recordContribution(p, "car", { month: NOW, date: "2026-11-01", amountCents: nov, kind: "scheduled" }).plan;
    expect(planMonth(p, NOW).goals[0].neededCents).toBe(nov); // this month's amount doesn't shrink once paid
    const dec = planMonth(p, "2026-12").goals[0].neededCents;
    expect(Math.abs(dec - Math.round(nov * 1.05))).toBeLessThanOrEqual(R(2));
  });

  it("adds no interest: at maturity you have exactly the target", () => {
    expect(vault(car(), NOW, "2026-11-10").maturityTotal).toBe(R(5_00_000));
  });

  it("survives saving and loading", () => {
    const p: MoneyPlan = { ...EMPTY_PLAN, goals: [car({ pct: 0.05, every: "year" }), { ...car(null), id: "flat" }, { ...car(), id: "default" }] };
    const back = parsePlan(JSON.parse(JSON.stringify(p))).goals.map((g) => g.stepUp);
    expect(back).toEqual([{ pct: 0.05, every: "year" }, null, undefined]);
    expect(parsePlan({ goals: [{ id: "x", name: "x", targetCents: 1, dueMonth: "2027-01", stepUp: { pct: 5, every: "month" } }] }).goals[0].stepUp).toBeUndefined();
  });
});
