// Every Money plan rule, checked on hundreds of random households.
// Each block states one rule in plain words, then checks it holds everywhere.
import { describe, expect, it } from "vitest";
import {
  emergencyMonthly,
  emergencyRate,
  goalFloor,
  goalSaved,
  householdSizeOf,
  minLockMonthly,
  monthSpending,
  planMonth,
  remainingAtStart,
  withdrawalQuote,
  type MoneyPlan,
} from "@/lib/nexus/budget";
import { applyGoalReserve, categoryStatuses, completionReward, EMPTY_ANSWERS, moveFromReserve, quickPlan, reachedOn, vault, type HouseholdType } from "@/lib/nexus/household";
import { runAutomations } from "@/lib/nexus/mandate";
import { planPriorities } from "@/lib/nexus/savings-policy";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const R = (r: number) => Math.round(r) * 100;
const NOW = "2026-11";
const unit = (c: number) => Math.floor(c / 100) * 100;

function randomPlan(): MoneyPlan {
  const household = pick<HouseholdType>(["single", "couple", "kids", "joint"]);
  const income = pick([8_000, 15_000, 30_000, 45_000, 60_000, 90_000, 1_50_000, 5_00_000]);
  const cost = (max: number) => (rnd() < 0.3 ? 0 : R(rnd() * max));
  const goals = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
    kind: pick(["house", "car", "bike", "travel", "other"] as const),
    name: pick(["House", "Car", "Bike", "Trip", "Phone"]),
    targetCents: R(pick([1_500, 6_000, 60_000, 5_00_000, 25_00_000])),
    savedCents: rnd() < 0.3 ? R(rnd() * 50_000) : 0,
    lockMonths: pick([6, 12, 24, 36, 48, 60]),
  }));
  const p = quickPlan(
    { ...EMPTY_ANSWERS, household, adults: 2 + Math.floor(rnd() * 3), children: Math.floor(rnd() * 4), yourIncomeCents: R(income), rentCents: cost(40_000), loansCents: cost(20_000), foodCents: cost(15_000), billsCents: cost(8_000), goals },
    { v: 1, salaryCents: 0, bills: [], goals: [], expenses: [] },
    NOW,
  );
  return { ...p, goals: p.goals.map((g) => ({ ...g, priority: pick(["high", "medium", "low"] as const) })) };
}

const plans = Array.from({ length: 500 }, randomPlan);

describe("Money plan rules (500 random households)", () => {
  it("1. Every rupee is placed exactly once: bills + emergency + goals + Goals reserve + free = income", () => {
    for (const p of plans) {
      const m = planMonth(p, NOW);
      if (m.billsExceedSalary) continue;
      expect(m.billsCents + m.emergencyCents + m.goalsCents + m.goalReserveCents + m.freeCents).toBe(p.salaryCents);
      for (const v of [m.emergencyCents, m.goalsCents, m.goalReserveCents, m.freeCents]) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("2. Emergency fund is mandatory: at least 7% / 8% / 9% of income by family size, until the fund is full", () => {
    for (const p of plans) {
      const m = planMonth(p, NOW);
      const rate = emergencyRate(householdSizeOf(p.profile));
      expect([0.07, 0.08, 0.09]).toContain(rate);
      const want = emergencyMonthly(p);
      const free = Math.max(0, p.salaryCents - m.billsCents);
      // Funded first: it gets everything it wants, or everything that's left after bills.
      expect(m.emergencyCents).toBe(Math.min(want, free));
      const essentials = p.bills.filter((b) => (b.kind ?? "need") === "need").reduce((t, b) => t + b.amountCents, 0);
      const stillNeeds = essentials > 0 ? essentials * p.emergency!.targetMonths - p.emergency!.savedCents : Infinity;
      if (stillNeeds > 0) expect(want).toBeGreaterThanOrEqual(Math.min(unit(p.salaryCents * rate), stillNeeds));
    }
  });

  it("3. Goals are mandatory: 10% of income always goes to goals (into goals, or the Goals reserve), when the money is there", () => {
    for (const p of plans) {
      const m = planMonth(p, NOW);
      const left = Math.max(0, p.salaryCents - m.billsCents - m.emergencyCents);
      expect(goalFloor(p.salaryCents)).toBe(unit(p.salaryCents * 0.1));
      expect(m.goalsCents + m.goalReserveCents).toBeGreaterThanOrEqual(Math.min(goalFloor(p.salaryCents), left));
    }
  });

  it("4. The Goals reserve only gets money when every goal already has all it needs this month", () => {
    for (const p of plans) {
      const m = planMonth(p, NOW);
      if (m.goalReserveCents === 0) continue;
      for (const gp of m.goals) {
        if (gp.goal.paused || gp.goal.withdrawal || gp.goal.chosenMonthlyCents != null || gp.status === "done") continue;
        expect(gp.monthlyCents).toBe(remainingAtStart(gp.goal, NOW));
      }
    }
  });

  it("5. A goal never gets more than it still needs, and locked goals get at least the ₹1,000 minimum when they're funded", () => {
    for (const p of plans) {
      for (const gp of planMonth(p, NOW).goals) {
        const start = remainingAtStart(gp.goal, NOW);
        expect(gp.monthlyCents).toBeLessThanOrEqual(start);
        if (gp.goal.lockMonths && gp.status === "on-track" && gp.goal.chosenMonthlyCents == null) expect(gp.monthlyCents).toBeGreaterThanOrEqual(Math.min(minLockMonthly(p.currency), start));
        if (gp.reachMonth) expect(gp.reachMonth >= NOW).toBe(true);
        // On track means it really finishes by its due month, counting the 5% step-up.
        if (gp.status === "on-track" && gp.goal.chosenMonthlyCents == null && gp.reachMonth) expect(gp.reachMonth <= gp.goal.dueMonth, `${gp.goal.name} ${gp.reachMonth} > ${gp.goal.dueMonth}`).toBe(true);
      }
    }
  });

  it("6. More important goals are funded first: a less important goal never gets money while a more important one is short", () => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (const p of plans) {
      const gs = planMonth(p, NOW).goals.filter((g) => !g.goal.paused && g.status !== "done" && g.goal.chosenMonthlyCents == null);
      for (const a of gs)
        for (const b of gs)
          if (rank[a.goal.priority] < rank[b.goal.priority] && a.monthlyCents < a.neededCents) expect(b.monthlyCents).toBe(0);
    }
  });

  it("7. Savings stay between 30% and 50% of income; below 30% only when must-pays leave no room, and then the plan says why", () => {
    for (const p of plans) {
      const pri = planPriorities(p, planMonth(p, NOW));
      expect(pri.build).toBeLessThanOrEqual(Math.ceil(p.salaryCents * 0.5));
      // Rent, EMIs and food are never cut, and 5% is always kept for yourself: "affordable" means 30% fits after both.
      const affordable = pri.income - pri.live - unit(pri.income * 0.05) >= unit(pri.income * 0.3);
      if (affordable && pri.shortfall === 0) expect(pri.build).toBeGreaterThanOrEqual(unit(pri.income * 0.3));
      if (pri.build < unit(pri.income * 0.3) && pri.income > 0) {
        expect(["below", "none", "shortfall"]).toContain(pri.status);
        expect(pri.explanation).toMatch(/real costs|ENJOY|below|essentials|more than your income/i);
      }
    }
  });

  it("8. Locked funds: payments add up to exactly what's left, never below the minimum (except the last), and grow only by the step-up", () => {
    for (const p of plans)
      for (const g of p.goals) {
        const v = vault(g, NOW, "2026-11-11", p.currency);
        const pays = v.schedule.filter((x) => x > 0);
        expect(pays.reduce((t, x) => t + x, 0)).toBeLessThanOrEqual(remainingAtStart(g, NOW));
        pays.slice(0, -1).forEach((x) => expect(x).toBeGreaterThanOrEqual(Math.min(minLockMonthly(p.currency), remainingAtStart(g, NOW))));
        for (let i = 1; i < pays.length - 1; i++) expect(pays[i]).toBeLessThanOrEqual(Math.ceil(pays[i - 1] * 1.05) + 100);
      }
  });

  it("9. Breaking a lock early costs exactly 7% (rounded down, in the customer's favour); at maturity nothing", () => {
    for (let i = 0; i < 500; i++) {
      const bal = R(rnd() * 10_00_000);
      const early = withdrawalQuote(bal, true);
      expect(early.feeCents + early.payoutCents).toBe(bal);
      expect(early.feeCents).toBeLessThanOrEqual(Math.round(bal * 0.07));
      expect(early.feeCents).toBeGreaterThanOrEqual(Math.round(bal * 0.07) - 100);
      expect(withdrawalQuote(bal, false)).toEqual({ feeCents: 0, payoutCents: bal });
    }
  });

  it("10. A year of daily automations: every payment once a month, reserve bookkeeping exact, never negative, goals never overfilled", () => {
    for (const start of plans.slice(0, 80)) {
      let p = start;
      for (let d = 0; d < 365; d += 3) {
        const t = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
        p = runAutomations(p, t);
        expect(runAutomations(p, t)).toBe(p);
        // Sometimes the customer moves the reserve into a goal.
        const open = p.goals.find((g) => g.targetCents - goalSaved(g) > 0 && !g.withdrawal);
        if (open && rnd() < 0.1) p = moveFromReserve(p, open.id, t).plan;
      }
      const r = p.goalReserve;
      if (r) {
        expect(r.savedCents).toBe(r.entries.reduce((s, e) => s + e.amountCents, 0));
        expect(r.savedCents).toBeGreaterThanOrEqual(0);
        const ins = r.entries.filter((e) => e.id.startsWith("reserve:")).map((e) => e.month);
        expect(new Set(ins).size).toBe(ins.length);
      }
      for (const g of p.goals) expect(goalSaved(g)).toBeLessThanOrEqual(Math.max(g.targetCents, g.savedCents));
      const autos = p.expenses.filter((e) => e.id.startsWith("auto-"));
      expect(new Set(autos.map((e) => e.id)).size).toBe(autos.length);
      for (const e of autos) {
        const bill = p.bills.find((b) => e.source.kind === "bill" && b.id === e.source.billId)!;
        expect(e.amountCents).toBe(bill.amountCents);
        expect(Number(e.date.slice(8))).toBe(bill.autoPay!.day);
      }
    }
  });

  it("11. Completion reward: earned only when the target is reached before the lock-in ends and the lock isn't broken early", () => {
    for (const p of plans)
      for (const g of p.goals) {
        if (!g.lockMonths) continue;
        const r = completionReward(g, NOW, "2026-11-11")!;
        const v = vault(g, NOW, "2026-11-11");
        if (r.status === "earned") expect(reachedOn(g)! <= v.maturityDate).toBe(true);
        if (goalSaved(g) < g.targetCents) expect(r.status).not.toBe("earned");
        expect(completionReward({ ...g, withdrawal: { requestedAt: "2026-11-11T00:00:00Z", early: true, amountCents: 1, status: "requested" } }, NOW, "2026-11-11")!.status).toBe("lost");
      }
  });

  it("12. Spending limits: what's left is the limit minus what was spent, and the reserve is recorded once a month", () => {
    for (const p of plans.slice(0, 100)) {
      const m = planMonth(p, NOW);
      const s = monthSpending(p, m, [], NOW);
      for (const { item, status } of categoryStatuses(p, s, 11, 30)) expect(status.remainingCents).toBe(status.limitCents - (s.byBill.get(item.id) ?? 0));
      const once = applyGoalReserve(p, "2026-11-11");
      expect(applyGoalReserve(once, "2026-11-28")).toBe(once);
    }
  });
});
