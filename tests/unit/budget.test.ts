import { describe, expect, it } from "vitest";
import { addBucket, addMonths, EMPTY_PLAN, monthSpending, monthsLeft, parsePlan, planMonth, type Goal, type MoneyPlan } from "@/lib/nexus/budget";

const NOW = "2026-11";
/** Builds percentage parts the way "Fine-tune amounts" does (no ready-made splits any more). */
const split = (salaryCents: number, parts: Array<[string, "need" | "want", number]>): MoneyPlan =>
  parts.reduce((p, [name, kind, pct]) => addBucket(p, name, kind, pct), { ...EMPTY_PLAN, salaryCents } as MoneyPlan);
const BALANCED: Array<[string, "need" | "want", number]> = [["Rent", "need", 0.3], ["Food and groceries", "need", 0.1], ["Bills and transport", "need", 0.1], ["Personal and fun", "want", 0.3]];
const LOW_RENT: Array<[string, "need" | "want", number]> = [["Rent", "need", 0.1], ["Food and groceries", "need", 0.15], ["Bills and transport", "need", 0.1], ["Personal and fun", "want", 0.3]];
const goal = (patch: Partial<Goal>): Goal => ({ id: patch.name ?? "g", name: "Goal", targetCents: 0, savedCents: 0, dueMonth: "2027-04", priority: "medium", ...patch });

describe("money plan", () => {
  it("counts this month as a saving month", () => {
    expect(monthsLeft("2026-11", NOW)).toBe(1);
    expect(monthsLeft("2027-04", NOW)).toBe(6);
    expect(monthsLeft("2026-01", NOW)).toBe(1); // past due: save the rest now
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });

  it("splits pay into bills, goals and free spending", () => {
    const m = planMonth(
      {
        salaryCents: 400_000,
        bills: [
          { id: "rent", name: "Rent", amountCents: 150_000 },
          { id: "food", name: "Groceries", amountCents: 50_000 },
        ],
        goals: [goal({ name: "MacBook Air", targetCents: 110_000, savedCents: 20_000 }), goal({ name: "Trip", targetCents: 120_000, dueMonth: "2027-10" })],
      },
      NOW,
    );
    expect(m.billsCents).toBe(200_000);
    // $900 over 6 months = $150; $1,200 over 12 months = $100. Together $250, below the
    // 10%-of-income minimum for goals ($400), so the earliest goal gets the extra $150.
    expect(m.goals.map((g) => g.neededCents)).toEqual([15_000, 10_000]);
    expect(m.goals.map((g) => g.monthlyCents)).toEqual([30_000, 10_000]);
    expect(m.goals.every((g) => g.status === "on-track")).toBe(true);
    expect(m.goalsCents).toBe(40_000);
    expect(m.freeCents).toBe(160_000);
    expect(m.shortfallCents).toBe(0);
    expect(m.billsCents + m.goalsCents + m.freeCents).toBe(m.salaryCents);
  });

  it("funds high-priority goals first and gives the rest a realistic date", () => {
    const m = planMonth(
      {
        salaryCents: 300_000,
        bills: [{ id: "rent", name: "Rent", amountCents: 250_000 }],
        goals: [
          goal({ name: "Car", targetCents: 600_000, dueMonth: "2027-10", priority: "low" }),
          goal({ name: "Emergency fund", targetCents: 300_000, dueMonth: "2027-04", priority: "high" }),
        ],
      },
      NOW,
    );
    const [car, emergency] = m.goals;
    expect(emergency.monthlyCents).toBe(50_000); // needs $500, gets all $500 available
    expect(emergency.status).toBe("on-track");
    expect(car.monthlyCents).toBe(0);
    expect(car.status).toBe("cannot-start");
    expect(m.freeCents).toBe(0);
    expect(m.shortfallCents).toBe(50_000);
  });

  it("moves an underfunded goal's date to when it can really be reached", () => {
    const m = planMonth({ salaryCents: 200_000, bills: [{ id: "r", name: "Rent", amountCents: 190_000 }], goals: [goal({ name: "Phone", targetCents: 120_000, dueMonth: "2027-01" })] }, NOW);
    const [phone] = m.goals;
    expect(phone.neededCents).toBe(40_000);
    expect(phone.monthlyCents).toBe(10_000);
    expect(phone.status).toBe("behind");
    expect(phone.reachMonth).toBe("2027-10"); // 12 months at $100
  });

  it("flags bills that are more than the salary", () => {
    const m = planMonth({ salaryCents: 100_000, bills: [{ id: "r", name: "Rent", amountCents: 120_000 }], goals: [] }, NOW);
    expect(m.billsExceedSalary).toBe(true);
    expect(m.freeCents).toBe(0);
  });

  it("marks finished goals as done", () => {
    const m = planMonth({ salaryCents: 100_000, bills: [], goals: [goal({ targetCents: 50_000, savedCents: 60_000 })] }, NOW);
    expect(m.goals[0].status).toBe("done");
    expect(m.goalsCents).toBe(0);
  });

  it("tracks this month's spending, including purchases made in the app", () => {
    const plan: MoneyPlan = {
      v: 1,
      salaryCents: 400_000,
      bills: [{ id: "food", name: "Groceries", amountCents: 50_000 }],
      goals: [goal({ name: "AirPods", targetCents: 25_000, productId: "apple-airpods-pro-3" })],
      expenses: [
        { id: "e1", date: "2026-11-03", amountCents: 12_000, note: "Weekly shop", source: { kind: "bill", billId: "food" } },
        { id: "e2", date: "2026-11-05", amountCents: 4_500, note: "Cinema", source: { kind: "free" } },
        { id: "e3", date: "2026-10-28", amountCents: 9_999, note: "Last month", source: { kind: "free" } },
      ],
    };
    const m = planMonth(plan, NOW);
    const s = monthSpending(
      plan,
      m,
      [
        { orderId: "o1", productId: "sony-wh-1000xm6", productName: "Sony", totalCents: 38_000, paidAt: "2026-11-07T10:00:00Z" },
        { orderId: "o2", productId: "apple-airpods-pro-3", productName: "AirPods", totalCents: 23_000, paidAt: "2026-11-08T10:00:00Z" },
      ],
      NOW,
    );
    expect(s.byBill.get("food")).toBe(12_000);
    expect(s.freeLoggedCents).toBe(4_500);
    expect(s.purchasesCents).toBe(38_000); // the AirPods were paid from their goal
    expect(s.goalPurchases.map((p) => p.orderId)).toEqual(["o2"]);
    expect(s.freeLeftCents).toBe(m.freeCents - 42_500);
  });

  it("only loads well-formed plans from storage", () => {
    expect(parsePlan("nonsense").goals).toEqual([]);
    const p = parsePlan({ salaryCents: -5, goals: [{ id: "a", name: "x", targetCents: 100, dueMonth: "bad" }, { id: "b", name: "y", targetCents: 100, dueMonth: "2027-01", priority: "urgent" }] });
    expect(p.salaryCents).toBe(0);
    expect(p.goals.map((g) => [g.id, g.priority])).toEqual([["b", "medium"]]);
  });
});

describe("fine-tune percentage parts", () => {
  it("sends whatever isn't assigned to savings", async () => {
    const { splitByKind } = await import("@/lib/nexus/budget");
    const plan = split(500_000, LOW_RENT);
    expect(plan.bills.map((b) => [b.name, b.pct])).toContainEqual(["Rent", 0.1]);
    expect(plan.bills.find((b) => b.name === "Personal and fun")!.amountCents).toBe(150_000); // 30%
    const s = splitByKind(plan);
    expect(s.savingsPct).toBeCloseTo(0.35);
    expect(s.needs + s.wants + s.savings).toBe(500_000);
  });

  it("moves percentage parts with the pay, and keeps % and $ in sync", async () => {
    const { withSalary, setBucketPct, setBucketAmount } = await import("@/lib/nexus/budget");
    let plan = split(400_000, BALANCED);
    const rent = plan.bills[0].id;
    plan = withSalary(plan, 600_000);
    expect(plan.bills[0].amountCents).toBe(180_000); // 30% of $6,000
    plan = setBucketPct(plan, rent, 0.2);
    expect(plan.bills[0].amountCents).toBe(120_000);
    plan = setBucketAmount(plan, rent, 150_000);
    expect(plan.bills[0].pct).toBeCloseTo(0.25);
  });

  it("flags parts that add up to more than the pay", async () => {
    const { setBucketPct, splitByKind } = await import("@/lib/nexus/budget");
    let plan = split(100_000, BALANCED);
    plan = setBucketPct(plan, plan.bills[0].id, 0.6);
    expect(splitByKind(plan)).toMatchObject({ savings: 0, overBy: 10_000 });
  });

  it("funds goals only from the savings part", async () => {
    const plan = { ...split(500_000, BALANCED), goals: [goal({ name: "Car", targetCents: 1_200_000, dueMonth: "2027-10" })] };
    const m = planMonth(plan, NOW);
    // Savings part is 20% = $1,000; the car needs $1,000 a month over 12 months.
    expect(m.goals[0]).toMatchObject({ monthlyCents: 100_000, status: "on-track" });
    expect(m.freeCents).toBe(0);
  });
});

describe("daily limit and checklist", () => {
  it("turns personal money into a daily and weekly limit", async () => {
    const { allowance } = await import("@/lib/nexus/budget");
    const plan = split(300_000, BALANCED); // personal 30% = $900
    const want = plan.bills.find((b) => b.kind === "want")!;
    const spending = { byBill: new Map([[want.id, 30_000]]), freeLoggedCents: 0, purchasesCents: 0, goalPurchases: [], freeSpentCents: 0, freeLeftCents: 0 };
    const a = allowance(plan, spending, 11, 30)!;
    expect(a.dayCents).toBe(3_000); // $30 a day
    expect(a.weekCents).toBe(21_000);
    expect(a.leftPerDayCents).toBe(3_000); // $600 left over 20 days
  });

  it("ticks off the money checklist from the plan", async () => {
    const { moneyGuide } = await import("@/lib/nexus/budget");
    const empty = moneyGuide(EMPTY_PLAN, planMonth(EMPTY_PLAN, NOW));
    expect(empty.find((s) => s.id === "pay")!.done).toBe(false);
    const plan = { ...split(500_000, LOW_RENT), goals: [goal({ name: "Emergency fund", targetCents: 600_000, savedCents: 600_000 })] };
    const steps = Object.fromEntries(moneyGuide(plan, planMonth(plan, NOW)).map((s) => [s.id, s.done]));
    expect(steps).toMatchObject({ pay: true, "every-dollar": true, "pay-first": true, housing: true, emergency: true, goals: true, daily: true });
  });
});
