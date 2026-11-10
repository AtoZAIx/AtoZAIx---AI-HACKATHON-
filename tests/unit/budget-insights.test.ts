import { describe, expect, it } from "vitest";
import { monthSpending, planMonth, type Goal, type MoneyPlan } from "@/lib/nexus/budget";
import { analyzeMoney, clockFor } from "@/lib/nexus/budget-insights";

const goal = (patch: Partial<Goal>): Goal => ({ id: patch.name ?? "g", name: "Goal", targetCents: 0, savedCents: 0, dueMonth: "2027-04", priority: "medium", ...patch });
const clock = { now: "2026-11", day: 15, daysInMonth: 30 };

function analyze(plan: MoneyPlan, c = clock) {
  const month = planMonth(plan, c.now);
  return analyzeMoney(plan, month, monthSpending(plan, month, [], c.now), c);
}

const base: MoneyPlan = { v: 1, salaryCents: 500_000, bills: [{ id: "rent", name: "Rent", amountCents: 200_000 }], goals: [], expenses: [] };

describe("money health", () => {
  it("suggests an emergency fund of three months of bills, with a one-tap fix", () => {
    const h = analyze(base);
    const e = h.insights.find((i) => i.id === "emergency-missing")!;
    expect(e.action).toMatchObject({ type: "add-emergency", targetCents: 600_000, dueMonth: "2027-10" });
    expect(h.parts.find((p) => p.key === "emergency")!.value).toBe(0);
  });

  it("flags housing above 30% of pay", () => {
    expect(analyze(base).insights.some((i) => i.id === "housing")).toBe(true);
  });

  it("offers a realistic date for a goal that's behind", () => {
    const h = analyze({ ...base, salaryCents: 210_000, goals: [goal({ name: "Phone", targetCents: 120_000, dueMonth: "2027-01" })] });
    const behind = h.insights.find((i) => i.id === "behind-Phone")!;
    expect(behind.action).toMatchObject({ type: "move-date", dueMonth: "2027-10" });
  });

  it("shows how unplanned money could reach a goal sooner", () => {
    const h = analyze({ ...base, goals: [goal({ name: "Laptop", targetCents: 120_000, dueMonth: "2027-10" }), goal({ name: "Emergency fund", targetCents: 600_000, savedCents: 600_000 })] });
    const u = h.insights.find((i) => i.id === "unplanned")!;
    expect(u.action?.type).toBe("move-date");
    expect(u.action && "dueMonth" in u.action && u.action.dueMonth < "2027-10").toBe(true);
  });

  it("warns when spending runs ahead of plan and gives a daily limit", () => {
    const plan: MoneyPlan = { ...base, expenses: [{ id: "x", date: "2026-11-05", amountCents: 250_000, note: "", source: { kind: "free" } }] };
    const h = analyze(plan);
    const pace = h.insights.find((i) => i.id === "pace")!;
    expect(pace.tone).toBe("warn");
    expect(pace.detail).toMatch(/a day/);
  });

  it("scores a healthy plan as strong and lists only real amounts", () => {
    const h = analyze({
      ...base,
      salaryCents: 600_000,
      goals: [goal({ name: "Emergency fund", targetCents: 900_000, savedCents: 700_000, dueMonth: "2027-10" }), goal({ name: "Trip", targetCents: 600_000, dueMonth: "2027-04" })],
    });
    expect(h.score).toBeGreaterThanOrEqual(75);
    expect(h.band).toBe("strong");
    for (const i of h.insights) {
      for (const m of i.detail.matchAll(/\$([\d,]+)/g)) expect(h.amounts).toContain(Number(m[1].replace(/,/g, "")) * 100);
    }
  });

  it("knows the day of the month", () => {
    expect(clockFor(new Date(2026, 1, 10))).toEqual({ now: "2026-02", day: 10, daysInMonth: 28 });
  });
});

describe("AI money coach", () => {
  it("falls back to a rules coach without Gemini, using the analysis' own words", async () => {
    const { coachMoney } = await import("@/lib/nexus/money-coach");
    const h = analyze(base);
    const reply = await coachMoney({ score: h.score, band: h.band, parts: h.parts, insights: h.insights, amounts: h.amounts });
    expect(reply.source).toBe("rules");
    expect(reply.tips[0]).toContain(h.insights[0].title);
    expect(reply.headline).toContain(`${h.score} of 100`);
  });
});
