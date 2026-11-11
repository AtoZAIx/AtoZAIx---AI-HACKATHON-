/**
 * Auto-debit for locked funds, shaped on RBI's Digital Payments – E-mandate
 * Framework, 2026. Pure and deterministic.
 *
 * SIMULATED: nothing here moves money. A live version needs a licensed bank
 * partner to hold the fund (for example a recurring deposit in the user's
 * name) and an RBI-authorised payment aggregator to run UPI AutoPay or
 * e-NACH. The rules below are the ones that partner would enforce:
 *  - the user approves the mandate once (in their UPI app / bank page);
 *  - a fixed amount on a fixed day, from a start month until the fund matures;
 *  - up to ₹15,000 a debit runs without approving each one;
 *  - a notice at least 24 hours before every debit;
 *  - skip any month or cancel at any time.
 */
import { addMonths, goalSaved, minLockMonthly, type Goal, type Mandate, type MoneyPlan } from "./budget";
import { addMonthsToDate, applyAutoPays, applyGoalReserve, recordContribution } from "./household";

/** Per-debit limit without approving each debit (RBI e-mandate framework; INR). */
export const MANDATE_MAX_CENTS = 15_000_00;
export const MANDATE_TERMS_VERSION = "2026-11 e-mandate v1";

const pad = (n: number) => String(n).padStart(2, "0");
export const debitDate = (month: string, day: number) => `${month}-${pad(day)}`;

/** The day before a date, "YYYY-MM-DD": when the 24-hour pre-debit notice goes out. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export interface MandateInput {
  amountCents: number;
  day: number;
  rail: Mandate["rail"];
}

export interface MandateCheck {
  ok: boolean;
  errors: string[];
  minCents: number;
  maxCents: number;
}

/** Validates a requested mandate for a goal before the user is asked to approve it. */
export function checkMandate(goal: Goal, input: MandateInput, currency: MoneyPlan["currency"]): MandateCheck {
  const minCents = minLockMonthly(currency);
  const maxCents = MANDATE_MAX_CENTS;
  const errors: string[] = [];
  if (!goal.lockMonths) errors.push("Auto-debit is only for locked funds.");
  if (goal.withdrawal) errors.push("This fund has been withdrawn.");
  if (goalSaved(goal) >= goal.targetCents) errors.push("This fund is already fully saved.");
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 28) errors.push("Pick a debit day from 1 to 28.");
  if (!(input.amountCents >= minCents)) errors.push(`The monthly amount must be at least the locked-fund minimum.`);
  if (input.amountCents > maxCents) errors.push("Above ₹15,000 a debit, every debit needs your approval. Set ₹15,000 or less, or add the rest by hand.");
  return { ok: errors.length === 0, errors, minCents, maxCents };
}

/**
 * When the first debit can run: this month if its day is still ahead and this
 * month isn't already saved, otherwise next month. Never before tomorrow, so
 * the 24-hour notice always comes first.
 */
export function firstDebitMonth(goal: Goal, day: number, today: string): string {
  const month = today.slice(0, 7);
  const already = (goal.contributions ?? []).some((c) => c.month === month && c.kind === "scheduled");
  return !already && Number(today.slice(8, 10)) < day ? month : addMonths(month, 1);
}

/** The fund's maturity date: the last day a debit may run. */
export function mandateEndDate(goal: Goal, now: string): string {
  return addMonthsToDate(`${goal.startMonth ?? now}-01`, goal.lockMonths ?? 12);
}

/** Records the user's approval. Call only after they approved it (in the live version: in their UPI app / bank page). */
export function approveMandate(plan: MoneyPlan, goalId: string, input: MandateInput, ctx: { ref: string; consentAt: string; today: string; now: string }): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) => {
      if (g.id !== goalId) return g;
      if (!checkMandate(g, input, plan.currency).ok) return g;
      const mandate: Mandate = {
        ref: ctx.ref,
        status: "active",
        rail: input.rail,
        amountCents: Math.round(input.amountCents),
        day: input.day,
        startMonth: firstDebitMonth(g, input.day, ctx.today),
        endDate: mandateEndDate(g, ctx.now),
        consentAt: ctx.consentAt,
        termsVersion: MANDATE_TERMS_VERSION,
        skipMonths: [],
        debits: [],
        cancelledAt: null,
        simulated: true,
      };
      return { ...g, mandate };
    }),
  };
}

/** The user opts out of one month's debit (before it runs). */
export function skipMandateMonth(plan: MoneyPlan, goalId: string, month: string): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) =>
      g.id === goalId && g.mandate?.status === "active" && !g.mandate.debits.some((d) => d.month === month)
        ? {
            ...g,
            mandate: {
              ...g.mandate,
              skipMonths: [...new Set([...g.mandate.skipMonths, month])],
            },
          }
        : g,
    ),
  };
}

/** Undo a skip, if that month's debit hasn't run yet. */
export function unskipMandateMonth(plan: MoneyPlan, goalId: string, month: string): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) =>
      g.id === goalId && g.mandate
        ? {
            ...g,
            mandate: {
              ...g.mandate,
              skipMonths: g.mandate.skipMonths.filter((m) => m !== month),
            },
          }
        : g,
    ),
  };
}

/** Cancels the mandate. No further debits; past ones stay in the history. */
export function cancelMandate(plan: MoneyPlan, goalId: string, at: string): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) =>
      g.id === goalId && g.mandate?.status === "active"
        ? {
            ...g,
            mandate: { ...g.mandate, status: "cancelled", cancelledAt: at },
          }
        : g,
    ),
  };
}

export interface NextDebit {
  month: string;
  date: string;
  /** When the 24-hour notice goes out. */
  noticeDate: string;
  amountCents: number;
  skipped: boolean;
  /** Today is inside the notice window (notice sent, debit not yet run). */
  noticeOpen: boolean;
}

/** The next debit that hasn't run yet, with its notice date. Null when the mandate isn't active or has ended. */
export function nextDebit(goal: Goal, today: string): NextDebit | null {
  const m = goal.mandate;
  if (!m || m.status !== "active") return null;
  let month = m.startMonth > today.slice(0, 7) ? m.startMonth : today.slice(0, 7);
  // This month's debit already ran (or its day has passed): look at next month.
  if (m.debits.some((d) => d.month === month) || debitDate(month, m.day) < today) month = addMonths(month, 1);
  const date = debitDate(month, m.day);
  if (date > m.endDate) return null;
  const remaining = Math.max(0, goal.targetCents - goalSaved(goal));
  if (remaining <= 0) return null;
  const noticeDate = dayBefore(date);
  return {
    month,
    date,
    noticeDate,
    amountCents: Math.min(m.amountCents, remaining),
    skipped: m.skipMonths.includes(month),
    noticeOpen: today >= noticeDate && today < date,
  };
}

/**
 * Runs due debits (simulated). Idempotent: each month runs at most once, as a
 * contribution with id `<goal>:<month>`. A skipped or paused month is logged
 * as skipped. The mandate completes once the fund is fully saved or matures.
 * Returns the same plan object when nothing is due.
 */
export function applyMandates(plan: MoneyPlan, today: string): { plan: MoneyPlan; debited: string[] } {
  const month = today.slice(0, 7);
  const debited: string[] = [];
  let next = plan;
  for (const g of plan.goals) {
    const m = g.mandate;
    if (!m || m.status !== "active") continue;
    const date = debitDate(month, m.day);
    const remaining = Math.max(0, g.targetCents - goalSaved(g));
    const ended = today > m.endDate || remaining <= 0;
    if (ended) {
      next = withMandate(next, g.id, { ...m, status: "completed" });
      continue;
    }
    if (month < m.startMonth || today < date || date > m.endDate || m.debits.some((d) => d.month === month)) continue;
    if (m.skipMonths.includes(month) || g.paused || g.withdrawal) {
      next = withMandate(next, g.id, {
        ...m,
        debits: [...m.debits, { month, date, amountCents: 0, status: "skipped" }],
      });
      continue;
    }
    const amount = Math.min(m.amountCents, remaining);
    const r = recordContribution(next, g.id, {
      month,
      date,
      amountCents: amount,
      kind: "scheduled",
    });
    next = r.plan;
    const updated = next.goals.find((x) => x.id === g.id)!;
    const latest = updated.mandate!;
    next = withMandate(next, g.id, {
      ...latest,
      // The debit that fills the fund also ends the mandate, in the same run (so a second run the same day changes nothing).
      status: goalSaved(updated) >= updated.targetCents ? "completed" : latest.status,
      debits: [
        ...latest.debits,
        {
          month,
          date,
          amountCents: r.duplicate ? 0 : amount,
          status: r.duplicate ? "skipped" : "debited",
        },
      ],
    });
    if (!r.duplicate) debited.push(g.name);
  }
  return { plan: next, debited };
}

function withMandate(plan: MoneyPlan, goalId: string, mandate: Mandate): MoneyPlan {
  return {
    ...plan,
    goals: plan.goals.map((g) => (g.id === goalId ? { ...g, mandate } : g)),
  };
}

/** An active mandate replaces auto-save for that fund. */
export const hasActiveMandate = (g: Goal) => g.mandate?.status === "active";

/**
 * Runs every automatic payment for today (bill auto-pay, auto-save, auto-debit)
 * until nothing more changes: finishing one fund can free money for another
 * the same day. Each step is idempotent, so this settles in a few passes.
 */
export function runAutomations(plan: MoneyPlan, today: string): MoneyPlan {
  let current = plan;
  for (let i = 0; i < 5; i++) {
    // Bills and auto-save, then auto-debits, then the rest of the 10% for goals into the Goals reserve.
    const next = applyGoalReserve(applyMandates(applyAutoPays(current, today).plan, today).plan, today);
    if (next === current) break;
    current = next;
  }
  return current;
}
