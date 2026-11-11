import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, type MoneyPlan } from "@/lib/nexus/budget";
import { createVaultGoal, setCategory } from "@/lib/nexus/household";
import { checkPurchase, needsOverride, toPlanCurrency } from "@/lib/nexus/spend-guard";

const D = (dollars: number) => dollars * 100;
const TODAY = new Date(2026, 10, 11); // 11 Nov 2026: 20 days left
const macbook = { productId: "apple-macbook-air-13-m4", productName: "MacBook Air 13 (M4)", totalCents: D(937) };

function usdPlan(enjoy: number): MoneyPlan {
  let p: MoneyPlan = { ...EMPTY_PLAN, currency: "USD", salaryCents: D(6_000) };
  p = setCategory(p, { group: "Housing", name: "Rent", kind: "need", enteredCents: D(1_500) });
  p = setCategory(p, { group: "Shopping", name: "Shopping", kind: "want", enteredCents: D(enjoy) });
  return p;
}

describe("Spend Guard: purchases are checked against your own plan", () => {
  it("without a plan it explains itself and never blocks", () => {
    const v = checkPurchase(null, macbook, [], TODAY);
    expect(v.kind).toBe("no-plan");
    expect(needsOverride(v)).toBe(false);
    expect(checkPurchase(EMPTY_PLAN, macbook, [], TODAY).kind).toBe("no-plan");
  });

  it("fits when it's within what's left of ENJOY this month, and shows the daily amount after", () => {
    const v = checkPurchase(usdPlan(1_500), macbook, [], TODAY);
    expect(v).toMatchObject({ kind: "enjoy", fits: true, leftCents: D(1_500), afterCents: D(563), daysLeft: 20, perDayAfterCents: D(28) });
    expect(needsOverride(v)).toBe(false);
  });

  it("is over when it doesn't fit, counting this month's spending and other app purchases", () => {
    let p = usdPlan(1_200);
    p = { ...p, expenses: [{ id: "e1", date: "2026-11-03", amountCents: D(100), note: "", source: { kind: "bill", billId: p.bills.find((b) => b.kind === "want")!.id } }] };
    const earlier = [{ orderId: "o1", productId: "sony-wh-1000xm6", productName: "Sony", totalCents: D(300), paidAt: "2026-11-05T10:00:00Z" }];
    const v = checkPurchase(p, macbook, earlier, TODAY);
    expect(v).toMatchObject({ kind: "enjoy", fits: false, spentCents: D(400), leftCents: D(800), overCents: D(137), resetsOn: "2026-12-01" });
    expect(needsOverride(v)).toBe(true);
  });

  it("pays a product you're saving for from that goal's fund", () => {
    const goal = { ...createVaultGoal({ id: "mac", name: "MacBook", targetCents: D(1_000), savedCents: D(950), lockMonths: 6, priority: "high", stepUp: null }, "2026-11"), productId: macbook.productId };
    const v = checkPurchase({ ...usdPlan(0), goals: [goal] }, macbook, [], TODAY);
    expect(v).toMatchObject({ kind: "goal", fits: true, goalName: "MacBook", savedCents: D(950) });
    const short = checkPurchase({ ...usdPlan(0), goals: [{ ...goal, savedCents: D(500) }] }, macbook, [], TODAY);
    expect(short).toMatchObject({ kind: "goal", fits: false, shortCents: D(437) });
  });

  it("offers a goal fund that could cover it instead", () => {
    const trip = createVaultGoal({ id: "trip", name: "Trip", targetCents: D(3_000), savedCents: D(2_000), lockMonths: 12, priority: "low", stepUp: null }, "2026-11");
    const v = checkPurchase({ ...usdPlan(200), goals: [trip] }, macbook, [], TODAY);
    expect(v.kind === "enjoy" && v.fundOptions.map((f) => f.name)).toEqual(["Trip"]);
  });

  it("converts dollar prices for rupee plans with a labelled estimate", () => {
    expect(toPlanCurrency(D(937), "INR")).toBe(93_700 * 88);
    const inr: MoneyPlan = { ...usdPlan(0), currency: "INR", salaryCents: 90_000_00 };
    const v = checkPurchase(setCategory(inr, { group: "Shopping", name: "Shopping", kind: "want", enteredCents: 1_00_000_00 }), macbook, [], TODAY);
    expect(v).toMatchObject({ kind: "enjoy", estimated: true, rate: 88, priceCents: 82_456_00, fits: true });
  });
});
