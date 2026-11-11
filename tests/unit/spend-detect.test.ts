import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, parsePlan, type MoneyPlan } from "@/lib/nexus/budget";
import { answersFrom, applyAutoPays, EMPTY_ANSWERS, quickPlan } from "@/lib/nexus/household";
import { addMonthlyPayment, monthPayments, removeMonthlyPayment } from "@/lib/nexus/money-payments";
import { addDetected, detectKind, detectPayments, findAmount, findDate, spentByKind } from "@/lib/nexus/spend-detect";

const TODAY = "2026-11-11";
const R = (rupees: number) => rupees * 100;

/** A rupee plan made by the quick setup: Rent, Food and groceries, Bills…, plus ENJOY categories. */
function plan(): MoneyPlan {
  return quickPlan({ ...EMPTY_ANSWERS, currency: "INR", yourIncomeCents: R(90_000), rentCents: R(20_000), foodCents: R(8_000), billsCents: R(4_000), medicalCents: R(1_500) }, { ...EMPTY_PLAN, currency: "INR" }, "2026-11");
}
const billName = (p: MoneyPlan, id: string | null) => p.bills.find((b) => b.id === id)?.name ?? "not in plan";

describe("auto-detect reads bank messages", () => {
  it("finds amount, date and shop in common SMS and UPI alerts, ignoring balances", () => {
    const p = plan();
    const [swiggy, dmart, ola] = detectPayments(
      p,
      `Rs.450.00 debited from A/c XX1234 on 05-11-26 to VPA swiggy@icici UPI Ref 412345678901. Avl Bal Rs.12,340.00
INR 2,340.50 spent on HDFC Bank Card XX9876 at DMART AVENUE SUPERMARTS on 2026-11-07. Avl bal: INR 45,000
Sent Rs.120.00 From HDFC Bank A/C *1234 To Ola Cabs On 08/11/26 Ref 1234`,
      TODAY,
    );
    expect(swiggy).toMatchObject({ date: "2026-11-05", amountCents: R(450), merchant: "Swiggy", kind: "eating-out" });
    expect(dmart).toMatchObject({ date: "2026-11-07", amountCents: 234_050, merchant: "Dmart Avenue Supermarts", kind: "groceries" });
    expect(ola).toMatchObject({ date: "2026-11-08", amountCents: R(120), merchant: "Ola Cabs", kind: "transport" });
  });

  it("skips money coming in and one-time passwords", () => {
    expect(detectPayments(plan(), "Your a/c XX1234 is credited with Rs.90,000 on 01-Nov-26 (Salary)\nYour OTP for payment of Rs 499 is 123456. Do not share", TODAY)).toEqual([]);
  });

  it("reads a statement row without mistaking an order number for the amount", () => {
    const [z] = detectPayments(plan(), "08/11/2026,ZOMATO ORDER 12345,385.00,,9,876.00", TODAY);
    expect(z).toMatchObject({ date: "2026-11-08", amountCents: R(385), merchant: "Zomato", kind: "eating-out" });
  });

  it("understands quick notes like “Swiggy 450” and “paid 1,200 for electricity bill yesterday”", () => {
    const [n, e] = detectPayments(plan(), "Netflix 649\npaid 1,200 for electricity bill yesterday", TODAY);
    expect(n).toMatchObject({ amountCents: R(649), merchant: "Netflix", kind: "subscriptions", date: TODAY });
    expect(e).toMatchObject({ amountCents: R(1_200), kind: "utilities", date: "2026-11-10" });
  });

  it("reads dates the way banks write them, never in the future", () => {
    expect(findDate("on 3 Nov", TODAY)).toBe("2026-11-03");
    expect(findDate("Nov 4, 2026", TODAY)).toBe("2026-11-04");
    expect(findDate("05-Nov-26", TODAY)).toBe("2026-11-05");
    expect(findDate("on 20-11-26", TODAY)).toBe(TODAY); // the future: today instead
    expect(findDate("11/09/2026", TODAY, "USD")).toBe("2026-11-09"); // US plans write the month first
    expect(findDate("11/09/2026", TODAY, "INR")).toBe("2026-09-11");
  });

  it("notes when a message is in another currency", () => {
    expect(findAmount("$12.50 at Starbucks")).toEqual({ cents: 1250, currency: "USD" });
    const [s] = detectPayments(plan(), "$12.50 at Starbucks", TODAY);
    expect(s.otherCurrency).toBe("USD");
  });
});

describe("auto-detect sorts spending into the plan's own categories", () => {
  it("knows common shops, the longest match winning", () => {
    expect(detectKind("Uber Eats").kind).toBe("eating-out");
    expect(detectKind("Uber").kind).toBe("transport");
    expect(detectKind("BigBasket").kind).toBe("groceries");
    expect(detectKind("Apollo Pharmacy").kind).toBe("health");
    expect(detectKind("Indian Oil").kind).toBe("fuel");
    expect(detectKind("Airtel Postpaid").kind).toBe("utilities");
    expect(detectKind("Ramesh Kumar").kind).toBe("other");
  });

  it("puts groceries in LIVE, eating out in ENJOY and unknown payees outside the plan", () => {
    const p = plan();
    const d = detectPayments(p, "DMart 2340\nSwiggy 450\nApollo Pharmacy 860\nOla 120\nRs 2000 to Ramesh Kumar", TODAY);
    expect(d.map((x) => billName(p, x.billId))).toEqual(["Food and groceries", "Food and outings", "Medical and medicines", "Bills, transport and phone", "not in plan"]);
    expect(d[4].reason).toMatch(/please choose/);
  });

  it("adds the chosen payments once, and remembers a shop the user sorted", () => {
    let p = plan();
    const groceries = p.bills.find((b) => b.name === "Food and groceries")!.id;
    const found = detectPayments(p, "Swiggy 450\nRs 2000 to Ramesh Kumar on 09-11-26", TODAY);
    const r = addDetected(p, [{ ...found[0], chosenBillId: found[0].billId }, { ...found[1], chosenBillId: groceries }]);
    expect(r.added).toBe(2);
    p = r.plan;
    expect(p.expenses.map((e) => [e.note, e.amountCents])).toEqual([
      ["Swiggy", R(450)],
      ["Ramesh Kumar", R(2_000)],
    ]);
    // Pasting the same messages again: spotted as duplicates, nothing added twice.
    const again = detectPayments(p, "Swiggy 450\nRs 2000 to Ramesh Kumar on 09-11-26", TODAY);
    expect(again.every((x) => x.duplicate)).toBe(true);
    expect(addDetected(p, again.map((x) => ({ ...x, chosenBillId: x.billId }))).added).toBe(0);
    // Next month, Ramesh is sorted into groceries by itself.
    const next = detectPayments(p, "Rs 1800 to Ramesh Kumar", "2026-12-02");
    expect(next[0]).toMatchObject({ billId: groceries, learned: true, reason: "You sorted this shop before" });
  });

  it("keeps learned shops and monthly payments when the plan is saved and loaded", () => {
    let p = plan();
    const groceries = p.bills.find((b) => b.name === "Food and groceries")!.id;
    p = addDetected(p, detectPayments(p, "Rs 2000 to Ramesh Kumar", TODAY).map((x) => ({ ...x, chosenBillId: groceries }))).plan;
    p = addMonthlyPayment(p, { name: "Netflix", group: "Entertainment", amountCents: R(649), day: 15, fromBillId: null, today: TODAY });
    const back = parsePlan(JSON.parse(JSON.stringify(p)));
    expect(back.merchantRules).toEqual({ rameshkumar: groceries });
    expect(back.bills.find((b) => b.name === "Netflix")).toMatchObject({ recurring: { fromBillId: null, movedCents: 0 }, autoPay: { day: 15 } });
  });
});

describe("monthly payments with auto-pay", () => {
  it("takes a new payment out of the broader category and gives it back when removed", () => {
    const p = plan();
    const bills = p.bills.find((b) => b.name === "Bills, transport and phone")!;
    const added = addMonthlyPayment(p, { name: "Electricity", group: "Utilities", amountCents: R(1_500), day: 20, fromBillId: bills.id, today: TODAY });
    expect(added.bills.find((b) => b.id === bills.id)!.amountCents).toBe(R(2_500));
    const elec = added.bills.find((b) => b.name === "Electricity")!;
    expect(elec).toMatchObject({ kind: "need", group: "Utilities", amountCents: R(1_500), fixed: true, autoPay: { day: 20, lastMonth: null } });
    // The plan's total costs are the same: nothing counted twice.
    const total = (x: MoneyPlan) => x.bills.reduce((t, b) => t + b.amountCents, 0);
    expect(total(added)).toBe(total(p));
    const removed = removeMonthlyPayment(added, elec.id);
    expect(removed.bills.find((b) => b.id === bills.id)!.amountCents).toBe(R(4_000));
    expect(removed.bills.some((b) => b.name === "Electricity")).toBe(false);
  });

  it("starts next month when its day has already passed, so a bill already paid isn't recorded twice", () => {
    const p = addMonthlyPayment(plan(), { name: "Gym", group: "Lifestyle", amountCents: R(1_200), day: 5, fromBillId: null, today: TODAY });
    expect(p.bills.find((b) => b.name === "Gym")).toMatchObject({ kind: "want", autoPay: { day: 5, lastMonth: "2026-11" } });
    expect(applyAutoPays(p, TODAY).recorded).not.toContain("Gym");
    expect(applyAutoPays(p, "2026-12-05").recorded).toContain("Gym");
  });

  it("is recorded on its day, and a bank SMS for the same bill is flagged as already paid", () => {
    let p = addMonthlyPayment(plan(), { name: "Netflix", group: "Entertainment", amountCents: R(649), day: 10, fromBillId: null, today: "2026-11-01" });
    p = applyAutoPays(p, TODAY).plan;
    expect(p.expenses.some((e) => e.id.startsWith("auto-") && e.amountCents === R(649))).toBe(true);
    const [sms] = detectPayments(p, "Rs.649 debited for NETFLIX.COM on 10-11-26", TODAY);
    expect(sms).toMatchObject({ duplicate: true, reason: "Already recorded by Netflix auto-pay" });
  });

  it("survives editing the plan in the quick setup", () => {
    const p = addMonthlyPayment(plan(), { name: "Electricity", group: "Utilities", amountCents: R(1_500), day: 20, fromBillId: plan().bills.find((b) => b.name === "Bills, transport and phone")!.id, today: TODAY });
    const edited = quickPlan(answersFrom(p), p, "2026-11");
    expect(edited.bills.find((b) => b.name === "Electricity")?.amountCents).toBe(R(1_500));
  });
});

describe("the Payments list", () => {
  it("shows auto-pay, detected, PayPal and savings together, newest first", () => {
    let p = applyAutoPays(plan(), TODAY).plan; // Rent on the 1st, EMIs off (none)
    p = addDetected(p, detectPayments(p, "Swiggy 450 on 05-11-26", TODAY).map((x) => ({ ...x, chosenBillId: x.billId }))).plan;
    const rows = monthPayments(p, [{ orderId: "o1", productId: "sony-wh-1000xm6", productName: "Sony WH-1000XM6", totalCents: 34_900, paidAt: "2026-11-09T10:00:00Z" }], "2026-11");
    expect(rows.map((r) => [r.date, r.name, r.source])).toEqual([
      ["2026-11-09", "Sony WH-1000XM6", "paypal"],
      ["2026-11-05", "Swiggy", "detected"],
      ["2026-11-01", "Rent", "auto-pay"],
    ]);
    expect(rows[0]).toMatchObject({ amountCents: 34_900 * 88, estimated: true });
    expect(rows[2].category).toBe("LIVE · Housing");
  });
});

describe("what a broad category's money went on", () => {
  it("splits Bills, transport and phone into recharge, fuel and transport, leaving out auto-pay", () => {
    let p = plan();
    const bills = p.bills.find((b) => b.name === "Bills, transport and phone")!.id;
    p = addDetected(p, detectPayments(p, "Ola 120\nAirtel recharge 599\nIndian Oil petrol 300\nUber 80", TODAY).map((x) => ({ ...x, chosenBillId: x.billId }))).plan;
    p = { ...p, expenses: [...p.expenses, { id: "manual1", date: "2026-11-09", amountCents: R(50), note: "", source: { kind: "bill", billId: bills } }] };
    expect(spentByKind(p, bills, "2026-11")).toEqual([
      { kind: "utilities", label: "Bills and recharge", cents: R(599) },
      { kind: "fuel", label: "Fuel", cents: R(300) },
      { kind: "transport", label: "Transport", cents: R(200) },
      { kind: "other", label: "Other", cents: R(50) },
    ]);
    expect(spentByKind(p, bills, "2026-12")).toEqual([]);
  });
});
