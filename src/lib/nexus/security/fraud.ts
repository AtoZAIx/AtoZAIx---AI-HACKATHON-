/**
 * Payment fraud intelligence: deterministic rules plus statistical anomaly
 * detection, every signal explained. Pure; the server builds the context from
 * its own records and never accepts a risk score from the browser.
 *   0–29  low    → allow
 *  30–59  medium → the shopper must confirm it's them (step-up)
 *  60+    high   → block
 */
import type { RiskAssessment, RiskSignal } from "../types";

export interface RiskContext {
  totalCents: number;
  quantity: number;
  /** Shopper's spending limit, if they set one. */
  budgetCents: number | null;
  /** Other orders that started payment in the last 10 minutes (all devices). */
  recentPaymentStarts: number;
  /** Paid totals of earlier confirmed orders. */
  history: number[];
  /** Declined card attempts anywhere in the last 10 minutes. */
  recentDeclines: number;
  /** Forged (unverified) PayPal messages received for this order. */
  forgedWebhooks: number;
  /** Milliseconds between the shopper approving and starting payment. */
  approvalToPayMs: number | null;
  // ---- advanced signals (optional; absent means "no data")
  /** Times payment was started on this order, including this one. */
  paymentAttempts?: number;
  /** Other orders that started payment from this device in the last 10 minutes. */
  devicePaymentStarts?: number;
  /** Shopping sessions opened from this device in the last hour. */
  deviceSessions?: number;
  /** Payments blocked for this device in the last 24 hours. */
  deviceBlocks?: number;
  /** True when the browser sent no device ID. */
  deviceMissing?: boolean;
  /** Trust score of the store agent being paid (0–100). */
  merchantTrust?: number;
  /** Share of the store's captured orders later refunded or disputed (with at least 5 orders). */
  merchantDisputeRate?: number | null;
}

export const CONFIRM_AT = 30;
export const BLOCK_AT = 60;
export const VELOCITY_WINDOW_MS = 10 * 60 * 1000;
/** Declined cards within the window that pause card payments (card-testing defence). */
export const CARD_TESTING_LIMIT = 5;

const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Robust outlier score (modified z, Iglewicz–Hoaglin): > 3.5 is an outlier. */
export function modifiedZ(x: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const med = median(history);
  const mad = median(history.map((h) => Math.abs(h - med)));
  if (mad === 0) return x === med ? 0 : x > med * 1.5 ? 10 : 0;
  return (0.6745 * (x - med)) / mad;
}

export function assessRisk(ctx: RiskContext, now = new Date()): RiskAssessment {
  const signals: RiskSignal[] = [];
  const add = (id: string, label: string, points: number, detail: string, source: "rule" | "statistical" = "rule") =>
    signals.push({ id, label, points, detail, source });

  // ---- velocity
  if (ctx.recentPaymentStarts >= 6) add("velocity", "Many payments at once", 60, `${ctx.recentPaymentStarts} other payments started in the last 10 minutes.`);
  else if (ctx.recentPaymentStarts >= 3) add("velocity", "Several payments quickly", 30, `${ctx.recentPaymentStarts} other payments started in the last 10 minutes.`);
  if ((ctx.devicePaymentStarts ?? 0) >= 3) add("device-velocity", "Same device, many payments", 25, `${ctx.devicePaymentStarts} other payments from this device in 10 minutes.`);
  if ((ctx.paymentAttempts ?? 1) >= 5) add("repeat-attempts", "Repeated payment attempts", 35, `Payment was started ${ctx.paymentAttempts} times for this order.`);
  else if ((ctx.paymentAttempts ?? 1) >= 3) add("repeat-attempts", "Several payment attempts", 15, `Payment was started ${ctx.paymentAttempts} times for this order.`);

  // ---- device and account patterns
  if ((ctx.deviceSessions ?? 0) >= 10) add("device-sessions", "Burst of new sessions", 15, `${ctx.deviceSessions} shopping sessions from this device in the last hour.`);
  if ((ctx.deviceBlocks ?? 0) > 0) add("device-history", "Device blocked recently", 30, `This device had ${ctx.deviceBlocks} blocked payment${ctx.deviceBlocks === 1 ? "" : "s"} in the last 24 hours.`);
  if (ctx.deviceMissing) add("device-missing", "No device signal", 5, "The browser didn't send its device ID.");

  // ---- amounts
  if (ctx.budgetCents && ctx.totalCents > ctx.budgetCents) {
    add("over-budget", "Above your spending limit", 30, `${money(ctx.totalCents)} is more than your ${money(ctx.budgetCents)} limit.`);
  }
  if (ctx.history.length >= 5) {
    const mean = ctx.history.reduce((s, x) => s + x, 0) / ctx.history.length;
    const sd = Math.sqrt(ctx.history.reduce((s, x) => s + (x - mean) ** 2, 0) / ctx.history.length) || mean * 0.25;
    const z = (ctx.totalCents - mean) / sd;
    const mz = modifiedZ(ctx.totalCents, ctx.history) ?? 0;
    if (z > 3 || mz > 3.5) {
      add("amount-anomaly", "Unusually large", 30, `Far above your typical ${money(median(ctx.history))} order (z ${z.toFixed(1)}, robust z ${mz.toFixed(1)}).`, "statistical");
    }
  } else if (ctx.totalCents >= 300_000) {
    add("large-first", "Large early purchase", 15, `${money(ctx.totalCents)} with little purchase history to compare against.`);
  }
  if (ctx.quantity >= 4) add("quantity", "Bulk quantity", 20, `${ctx.quantity} units in one order.`);

  // ---- payment rail
  if (ctx.recentDeclines >= 4) add("declines", "Many declined cards", 45, `${ctx.recentDeclines} declined card attempts in the last 10 minutes, a card-testing pattern.`);
  else if (ctx.recentDeclines >= 2) add("declines", "Recent declined cards", 20, `${ctx.recentDeclines} declined card attempts in the last 10 minutes.`);
  if (ctx.forgedWebhooks > 0) add("forged-webhook", "Fake PayPal messages", 30, `${ctx.forgedWebhooks} message${ctx.forgedWebhooks === 1 ? "" : "s"} claiming to be PayPal failed signature checks.`);
  if (ctx.approvalToPayMs !== null && ctx.approvalToPayMs >= 0 && ctx.approvalToPayMs < 1000) {
    add("instant", "Paid instantly after approval", 10, "Payment started under a second after approval, which looks automated.");
  }

  // ---- merchant risk indicators
  if (ctx.merchantTrust !== undefined && ctx.merchantTrust < 50) add("merchant-trust", "Store agent restricted", 30, `The store agent's trust score is ${ctx.merchantTrust}/100.`);
  else if (ctx.merchantTrust !== undefined && ctx.merchantTrust < 80) add("merchant-trust", "Store agent on watch", 10, `The store agent's trust score is ${ctx.merchantTrust}/100.`);
  if (ctx.merchantDisputeRate != null && ctx.merchantDisputeRate >= 0.2) {
    add("merchant-disputes", "Store has many refunds or disputes", 15, `${Math.round(ctx.merchantDisputeRate * 100)}% of this store's paid orders were refunded or disputed.`, "statistical");
  }

  const score = Math.min(100, signals.reduce((s, x) => s + x.points, 0));
  const level = score >= BLOCK_AT ? "high" : score >= CONFIRM_AT ? "medium" : "low";
  return {
    score,
    level,
    decision: level === "high" ? "block" : level === "medium" ? "confirm" : "allow",
    signals: signals.sort((a, b) => b.points - a.points),
    checkedAt: now.toISOString(),
  };
}
