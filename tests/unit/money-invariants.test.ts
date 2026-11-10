// Stress check: hundreds of random plans through every money feature, checking rules that must always hold
// (splits add up, nothing negative, savings ≤ 50%, schedules never over-plan, automations run once, plans save and load).
import { describe, expect, it } from "vitest";
import { goalSaved, parsePlan, planMonth, type MoneyPlan } from "@/lib/nexus/budget";
import { allocation, createVaultGoal, EMPTY_ANSWERS, emergencyStatus, quickPlan, recordContribution, vault, type HouseholdType } from "@/lib/nexus/household";
import { approveMandate, nextDebit, runAutomations } from "@/lib/nexus/mandate";
import { planPriorities } from "@/lib/nexus/savings-policy";

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const R = (r: number) => Math.round(r) * 100;
const NOW = "2026-11";

function randomPlan(): MoneyPlan {
  const household = pick<HouseholdType>(["single", "couple", "kids", "joint"]);
  const income = pick([0, 8_000, 15_000, 30_000, 45_000, 60_000, 90_000, 1_50_000, 5_00_000]);
  const cost = (max: number) => (rnd() < 0.3 ? 0 : R(rnd() * max));
  const goals = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
    kind: pick(["house", "car", "bike", "travel", "other"] as const),
    name: pick(["House", "Car", "Bike", "Trip", "Phone"]),
    targetCents: R(pick([1_500, 6_000, 60_000, 5_00_000, 25_00_000])),
    savedCents: rnd() < 0.3 ? R(rnd() * 50_000) : 0,
    lockMonths: pick([6, 12, 24, 36, 48, 60]),
  }));
  let p = quickPlan(
    { ...EMPTY_ANSWERS, household, adults: 2 + Math.floor(rnd() * 3), children: Math.floor(rnd() * 4), yourIncomeCents: R(income), partnerIncomeCents: household === "single" ? 0 : cost(30_000), rentCents: cost(40_000), loansCents: cost(20_000), foodCents: cost(15_000), billsCents: cost(8_000), goals },
    { v: 1, salaryCents: 0, bills: [], goals: [], expenses: [] },
    NOW,
  );
  // Random step-up choices and hand-typed amounts.
  p = { ...p, goals: p.goals.map((g) => ({ ...g, stepUp: pick([undefined, null, { pct: 0.05, every: "year" as const }]), chosenMonthlyCents: rnd() < 0.15 ? R(rnd() * 5_000) : null })) };
  return p;
}

const finite = (o: unknown): boolean => {
  if (typeof o === "number") return Number.isFinite(o);
  if (Array.isArray(o)) return o.every(finite);
  if (o && typeof o === "object") return Object.values(o).every(finite);
  return true;
};

describe("money maths invariants on 400 random plans", () => {
  it("splits always add up, nothing negative, no NaN, savings never above 50%", () => {
    for (let i = 0; i < 400; i++) {
      const p = randomPlan();
      const m = planMonth(p, NOW);
      const a = allocation(p, m);
      const pri = planPriorities(p, m);
      const ctx = JSON.stringify({ i, salary: p.salaryCents });
      expect(finite(m) && finite(a) && finite(pri), ctx).toBe(true);
      for (const v of [a.essentials, a.lifestyle, a.protection, a.goals, a.reserve, pri.live, pri.enjoy, pri.build, pri.unassigned]) expect(v, ctx).toBeGreaterThanOrEqual(0);
      // Emergency + goals never more than what's left after bills.
      expect(m.emergencyCents + m.goalsCents, ctx).toBeLessThanOrEqual(Math.max(0, p.salaryCents - m.billsCents));
      if (a.essentials + a.lifestyle <= a.income) expect(a.essentials + a.lifestyle + a.protection + a.goals + a.reserve, ctx).toBe(a.income);
      if (pri.shortfall === 0 && pri.live + pri.enjoy <= pri.income) expect(pri.live + pri.enjoy + pri.build + pri.unassigned, ctx).toBe(pri.income);
      expect(pri.build, ctx).toBeLessThanOrEqual(Math.ceil(p.salaryCents * 0.5));
      // No goal is given more this month than it still needed at the start of the month.
      for (const gp of m.goals) expect(gp.monthlyCents, ctx).toBeLessThanOrEqual(gp.goal.targetCents);
      // Emergency target and progress are sane.
      const e = emergencyStatus(p, NOW);
      expect(e.progress, ctx).toBeGreaterThanOrEqual(0);
      expect(e.progress, ctx).toBeLessThanOrEqual(1);
    }
  });

  it("locked-fund schedules never plan more than is left, and reach the target", () => {
    for (let i = 0; i < 400; i++) {
      for (const g of randomPlan().goals) {
        const v = vault(g, NOW, "2026-11-11", "INR");
        const left = Math.max(0, g.targetCents - goalSaved(g));
        expect(finite(v), g.name).toBe(true);
        expect(v.schedule.reduce((t, x) => t + x, 0)).toBeLessThanOrEqual(left);
        expect(v.maturityTotal).toBeLessThanOrEqual(g.targetCents);
        if (g.chosenMonthlyCents == null) expect(v.maturityTotal).toBe(g.targetCents);
        expect(v.schedule.every((x) => x >= 0)).toBe(true);
      }
    }
  });

  it("auto-pay, auto-save and auto-debit are idempotent across a whole year of daily runs", () => {
    for (let i = 0; i < 60; i++) {
      let p = randomPlan();
      if (p.salaryCents === 0) continue;
      const locked = p.goals.find((g) => g.lockMonths);
      if (locked && rnd() < 0.5) p = approveMandate(p, locked.id, { amountCents: R(2_000), day: 10, rail: "upi-autopay" }, { ref: "NXM-T", consentAt: "2026-11-01T00:00:00Z", today: "2026-11-01", now: NOW });
      for (let d = 0; d < 365; d += 1) {
        const t = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
        const once = runAutomations(p, t);
        const twice = runAutomations(once, t);
        expect(twice, `${i} ${t}`).toBe(once); // running again the same day changes nothing
        p = once;
      }
      // At most one scheduled contribution per goal per month, never above the target.
      for (const g of p.goals) {
        const months = (g.contributions ?? []).filter((c) => c.kind === "scheduled").map((c) => c.month);
        expect(new Set(months).size, g.name).toBe(months.length);
        expect(goalSaved(g), g.name).toBeLessThanOrEqual(Math.max(g.targetCents, g.savedCents));
        if (g.mandate) {
          expect(new Set(g.mandate.debits.map((x) => x.month)).size).toBe(g.mandate.debits.length);
          expect(g.mandate.debits.every((x) => x.date <= g.mandate!.endDate)).toBe(true);
          if (g.mandate.status === "active") expect(nextDebit(g, "2027-11-01")?.noticeDate ?? "").not.toBe("x");
        }
      }
      // Bills auto-paid at most once a month.
      const autos = p.expenses.filter((e) => e.id.startsWith("auto-")).map((e) => e.id);
      expect(new Set(autos).size).toBe(autos.length);
    }
  });

  it("every plan survives saving and loading unchanged", () => {
    for (let i = 0; i < 200; i++) {
      let p = randomPlan();
      const g = p.goals.find((x) => x.lockMonths);
      if (g) p = recordContribution(p, g.id, { month: NOW, date: "2026-11-02", amountCents: R(1_000), kind: "extra", key: `k${i}` }).plan;
      // Loading fills in defaults (e.g. profile.home: null); after that, saving and loading changes nothing.
      const once = parsePlan(JSON.parse(JSON.stringify(p)));
      const twice = parsePlan(JSON.parse(JSON.stringify(once)));
      expect(twice).toEqual(once);
      expect(once.goals.map((g) => [g.id, goalSaved(g), g.mandate?.status ?? null, g.stepUp])).toEqual(p.goals.map((g) => [g.id, goalSaved(g), g.mandate?.status ?? null, g.stepUp]));
      expect(once.bills.map((b) => [b.id, b.amountCents, b.autoPay ?? null])).toEqual(p.bills.map((b) => [b.id, b.amountCents, b.autoPay ?? null]));
    }
  });

  it("odd inputs: zero income, finished goal, past date", () => {
    const empty = { v: 1 as const, salaryCents: 0, bills: [], goals: [], expenses: [] };
    expect(finite(planPriorities(empty, planMonth(empty, NOW)))).toBe(true);
    const done = createVaultGoal({ id: "d", name: "Done", targetCents: R(10_000), savedCents: R(10_000), lockMonths: 6, priority: "low" }, NOW);
    expect(vault(done, NOW, "2026-11-11")).toMatchObject({ remaining: 0, requiredMonthly: 0, maturityTotal: R(10_000) });
    const late = { ...createVaultGoal({ id: "l", name: "Late", targetCents: R(10_000), savedCents: 0, lockMonths: 6, priority: "low" }, "2024-01") };
    expect(finite(vault(late, NOW, "2026-11-11"))).toBe(true);
    expect(vault(late, NOW, "2026-11-11").matured).toBe(true);
  });
});
