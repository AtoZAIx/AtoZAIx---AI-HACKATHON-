/**
 * Payments in the Money plan: monthly payments the user adds (with auto-pay),
 * and one list of everything paid this month. Pure functions; nothing here
 * moves real money.
 */
import { goalSaved, type BucketKind, type MoneyPlan, type Purchase } from "./budget";
import { autoSaveOf, monthlyFrom, setCategory } from "./household";
import { toPlanCurrency } from "./spend-guard";

/** Groups a monthly payment can belong to, and whether it is LIVE (must-pay) or ENJOY. */
export const PAYMENT_GROUPS: Array<{ group: string; kind: BucketKind; examples: string }> = [
  { group: "Utilities", kind: "need", examples: "electricity, gas, internet, phone" },
  { group: "Housing", kind: "need", examples: "maintenance, society charges" },
  { group: "Loans and debt", kind: "need", examples: "loan EMI, credit card" },
  { group: "Healthcare", kind: "need", examples: "insurance, regular medicines" },
  { group: "Family and children", kind: "need", examples: "school fees, tuition" },
  { group: "Transport", kind: "need", examples: "bus pass, vehicle EMI" },
  { group: "Entertainment", kind: "want", examples: "Netflix, Spotify, OTT" },
  { group: "Lifestyle", kind: "want", examples: "gym, classes" },
];

export interface NewMonthlyPayment {
  name: string;
  group: string;
  amountCents: number;
  /** Auto-pay day (1–28), or null to log it yourself. */
  day: number | null;
  /**
   * The broader category this was already counted in (e.g. "Bills, transport
   * and phone"): it shrinks by the same amount so nothing is counted twice.
   */
  fromBillId: string | null;
  /** "YYYY-MM-DD". When the day has already passed this month, auto-pay starts next month (it was paid already). */
  today?: string;
}

/** Adds a monthly payment, optionally on auto-pay, taking it out of a broader category so the plan isn't double-counted. */
export function addMonthlyPayment(plan: MoneyPlan, p: NewMonthlyPayment): MoneyPlan {
  const name = p.name.trim().slice(0, 60);
  const amount = Math.max(0, Math.round(p.amountCents));
  const group = PAYMENT_GROUPS.find((g) => g.group === p.group) ?? PAYMENT_GROUPS[0];
  if (!name || amount <= 0 || plan.bills.some((b) => b.group === group.group && b.name === name)) return plan;

  let next = plan;
  let moved = 0;
  const from = p.fromBillId ? plan.bills.find((b) => b.id === p.fromBillId && !b.recurring) : undefined;
  if (from) {
    moved = Math.min(amount, from.amountCents);
    const left = from.amountCents - moved;
    next = { ...next, bills: next.bills.map((b) => (b.id === from.id ? { ...b, frequency: "monthly", enteredCents: left, amountCents: left } : b)) };
  }
  next = setCategory(next, { group: group.group, name, kind: group.kind, enteredCents: amount, fixed: true });
  const day = p.day == null ? null : Math.min(28, Math.max(1, Math.round(p.day)));
  const startsNextMonth = Boolean(day && p.today && Number(p.today.slice(8, 10)) > day);
  return {
    ...next,
    bills: next.bills.map((b) => (b.group === group.group && b.name === name ? { ...b, autoPay: day ? { day, lastMonth: startsNextMonth ? p.today!.slice(0, 7) : null } : null, recurring: { fromBillId: from?.id ?? null, movedCents: moved } } : b)),
  };
}

/** Removes a monthly payment you added and gives its amount back to the category it came from. */
export function removeMonthlyPayment(plan: MoneyPlan, billId: string): MoneyPlan {
  const bill = plan.bills.find((b) => b.id === billId && b.recurring);
  if (!bill) return plan;
  const { fromBillId, movedCents } = bill.recurring!;
  return {
    ...plan,
    bills: plan.bills
      .filter((b) => b.id !== billId)
      .map((b) => {
        if (b.id !== fromBillId || movedCents <= 0) return b;
        const amount = monthlyFrom(b.enteredCents ?? b.amountCents, b.frequency ?? "monthly") + movedCents;
        return { ...b, frequency: "monthly", enteredCents: amount, amountCents: amount };
      }),
  };
}

/** Where a broader category would be a sensible place to take a new payment from. */
export function suggestedSource(plan: MoneyPlan, group: string) {
  return plan.bills.find((b) => b.group === group && !b.recurring && b.amountCents > 0) ?? null;
}

export type PaymentSource = "auto-pay" | "detected" | "you" | "paypal" | "auto-save" | "auto-debit" | "saving";

export interface PaymentRow {
  id: string;
  date: string;
  name: string;
  /** Plan category name, or "Not in your plan". */
  category: string;
  amountCents: number;
  source: PaymentSource;
  /** Spending entries can be removed; savings and PayPal payments are shown only. */
  expenseId: string | null;
  /** PayPal amounts are in US dollars and converted for other plans. */
  estimated: boolean;
}

/** Everything paid this month, newest first: bills and spending, PayPal purchases and savings. */
export function monthPayments(plan: MoneyPlan, purchases: Purchase[], now: string): PaymentRow[] {
  const currency = plan.currency ?? "USD";
  const rows: PaymentRow[] = [];
  for (const e of plan.expenses) {
    if (!e.date.startsWith(now)) continue;
    const source: PaymentSource = e.id.startsWith("auto-") ? "auto-pay" : e.id.startsWith("det-") ? "detected" : "you";
    const bill = e.source.kind === "bill" ? plan.bills.find((b) => b.id === (e.source as { billId: string }).billId) : undefined;
    const category = bill?.name ?? "Not in your plan";
    const name = e.id.startsWith("auto-") ? category : e.note.replace(/^Auto-pay: /, "") || category;
    // "Rent · Rent" says nothing: show the bill's group (and whether it's LIVE or ENJOY) instead.
    const label = name === category && bill ? `${(bill.kind ?? "need") === "need" ? "LIVE" : "ENJOY"} · ${bill.group ?? "Bills"}` : category;
    rows.push({ id: e.id, date: e.date, name, category: label, amountCents: e.amountCents, source, expenseId: e.id, estimated: false });
  }
  for (const p of purchases) {
    if (p.paidAt.slice(0, 7) !== now) continue;
    rows.push({
      id: `pp-${p.orderId}`,
      date: p.paidAt.slice(0, 10),
      name: p.productName,
      category: plan.goals.some((g) => g.productId === p.productId) ? "From a goal fund" : (plan.bills.find((b) => b.kind === "want")?.name ?? "Not in your plan"),
      amountCents: toPlanCurrency(p.totalCents, currency),
      source: "paypal",
      expenseId: null,
      estimated: currency !== "USD",
    });
  }
  for (const g of plan.goals) {
    for (const c of g.contributions ?? []) {
      if (c.month !== now || c.amountCents <= 0) continue;
      const debited = g.mandate?.debits.some((d) => d.month === c.month && d.status === "debited") && c.kind === "scheduled";
      const a = autoSaveOf(g);
      const source: PaymentSource = debited ? "auto-debit" : c.kind === "scheduled" && a && Number(c.date.slice(8, 10)) === a.day ? "auto-save" : "saving";
      rows.push({ id: `sv-${g.id}-${c.id}`, date: c.date, name: `Saved for ${g.name}`, category: goalSaved(g) >= g.targetCents ? "Goal reached" : "BUILD · goals", amountCents: c.amountCents, source, expenseId: null, estimated: false });
    }
  }
  return rows.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)));
}
