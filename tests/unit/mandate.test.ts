import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, parsePlan, type MoneyPlan } from "@/lib/nexus/budget";
import { applyAutoPays, autoSaveOf, createVaultGoal } from "@/lib/nexus/household";
import { applyMandates, approveMandate, cancelMandate, checkMandate, dayBefore, MANDATE_MAX_CENTS, nextDebit, skipMandateMonth } from "@/lib/nexus/mandate";

const R = (rupees: number) => rupees * 100;
const NOW = "2026-11";

const base = (): MoneyPlan => ({
  ...EMPTY_PLAN,
  currency: "INR",
  salaryCents: R(60_000),
  goals: [createVaultGoal({ id: "car", name: "Car", targetCents: R(2_40_000), savedCents: 0, lockMonths: 24, priority: "high" }, NOW)],
});
const approve = (p: MoneyPlan, today = "2026-11-02", amount = R(10_000), day = 5) =>
  approveMandate(p, "car", { amountCents: amount, day, rail: "upi-autopay" }, { ref: "NXM-TEST", consentAt: "2026-11-02T10:00:00Z", today, now: NOW });
const mandateOf = (p: MoneyPlan) => p.goals[0].mandate!;

describe("auto-debit mandates for locked funds (simulated, RBI e-mandate shape)", () => {
  it("only approves valid mandates: locked fund, ₹1,000–₹15,000, day 1–28", () => {
    const g = base().goals[0];
    expect(checkMandate(g, { amountCents: R(10_000), day: 5, rail: "upi-autopay" }, "INR").ok).toBe(true);
    expect(checkMandate(g, { amountCents: R(500), day: 5, rail: "upi-autopay" }, "INR").ok).toBe(false);
    expect(checkMandate(g, { amountCents: MANDATE_MAX_CENTS + 100, day: 5, rail: "upi-autopay" }, "INR").errors.join(" ")).toMatch(/every debit needs your approval/);
    expect(checkMandate(g, { amountCents: R(10_000), day: 31, rail: "upi-autopay" }, "INR").ok).toBe(false);
    expect(checkMandate({ ...g, lockMonths: null }, { amountCents: R(10_000), day: 5, rail: "upi-autopay" }, "INR").ok).toBe(false);
    // An invalid request is never stored.
    expect(approve(base(), "2026-11-02", R(50_000)).goals[0].mandate).toBeUndefined();
  });

  it("records the approval: reference, consent time, terms, start and end (the fund's maturity)", () => {
    const m = mandateOf(approve(base()));
    expect(m).toMatchObject({ ref: "NXM-TEST", status: "active", amountCents: R(10_000), day: 5, startMonth: "2026-11", endDate: "2028-11-01", consentAt: "2026-11-02T10:00:00Z", simulated: true });
    expect(m.termsVersion).toBeTruthy();
    // Day already passed this month → the first debit is next month.
    expect(mandateOf(approve(base(), "2026-11-20")).startMonth).toBe("2026-12");
  });

  it("gives a notice the day before, then debits once on the day", () => {
    const p = approve(base());
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(nextDebit(p.goals[0], "2026-11-03")).toMatchObject({ date: "2026-11-05", noticeDate: "2026-11-04", noticeOpen: false });
    expect(nextDebit(p.goals[0], "2026-11-04")).toMatchObject({ noticeOpen: true, amountCents: R(10_000) });
    expect(applyMandates(p, "2026-11-04").plan).toBe(p); // not yet
    const r = applyMandates(p, "2026-11-05");
    expect(r.debited).toEqual(["Car"]);
    expect(r.plan.goals[0].contributions).toEqual([expect.objectContaining({ id: "car:2026-11", amountCents: R(10_000), virtual: true })]);
    expect(mandateOf(r.plan).debits).toEqual([{ month: "2026-11", date: "2026-11-05", amountCents: R(10_000), status: "debited" }]);
    expect(applyMandates(r.plan, "2026-11-25").plan).toBe(r.plan); // never twice a month
    expect(nextDebit(r.plan.goals[0], "2026-11-25")).toMatchObject({ date: "2026-12-05" });
  });

  it("lets the user skip a month or cancel, and replaces auto-save while active", () => {
    let p = approve(base());
    expect(autoSaveOf(p.goals[0])).toBeNull(); // auto-debit replaces auto-save
    expect(applyAutoPays(p, "2026-11-28").recorded).toEqual([]);
    p = skipMandateMonth(p, "car", "2026-11");
    expect(nextDebit(p.goals[0], "2026-11-04")).toMatchObject({ skipped: true });
    p = applyMandates(p, "2026-11-05").plan;
    expect(mandateOf(p).debits).toEqual([expect.objectContaining({ month: "2026-11", status: "skipped", amountCents: 0 })]);
    expect(p.goals[0].contributions ?? []).toEqual([]);
    p = cancelMandate(p, "car", "2026-11-06T09:00:00Z");
    expect(mandateOf(p)).toMatchObject({ status: "cancelled", cancelledAt: "2026-11-06T09:00:00Z" });
    expect(applyMandates(p, "2026-12-05").plan).toBe(p); // no more debits
    expect(autoSaveOf(p.goals[0])).not.toBeNull(); // auto-save is back
  });

  it("never takes more than the fund still needs, and completes when full", () => {
    let p: MoneyPlan = { ...base(), goals: [{ ...base().goals[0], targetCents: R(15_000) }] };
    p = approve(p);
    p = applyMandates(p, "2026-11-05").plan;
    p = applyMandates(p, "2026-12-05").plan;
    expect(mandateOf(p).debits.map((d) => d.amountCents)).toEqual([R(10_000), R(5_000)]);
    p = applyMandates(p, "2027-01-05").plan;
    expect(mandateOf(p).status).toBe("completed");
  });

  it("survives saving and loading, and rejects malformed data", () => {
    const p = applyMandates(approve(base()), "2026-11-05").plan;
    expect(parsePlan(JSON.parse(JSON.stringify(p))).goals[0].mandate).toEqual(mandateOf(p));
    expect(parsePlan({ goals: [{ id: "g", name: "x", targetCents: 100, dueMonth: "2027-01", mandate: { ref: "", amountCents: -5 } }] }).goals[0].mandate).toBeNull();
  });
});
