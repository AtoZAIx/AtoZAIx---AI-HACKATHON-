import type { Cents } from "./types";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(fractionDigits: number) {
  const key = String(fractionDigits);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** $1,249 for whole dollars, $1,249.50 otherwise. */
export function formatMoney(cents: Cents): string {
  return formatter(cents % 100 === 0 ? 0 : 2).format(cents / 100);
}

/** PayPal amount strings are decimal dollars with exactly two places. */
export function toPayPalValue(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid amount: ${cents}`);
  const dollars = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${dollars}.${rest}`;
}

/** Parse a PayPal decimal string into integer cents without float drift. */
export function parsePayPalValue(value: string): Cents {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid PayPal amount: ${value}`);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(frac);
}

/** Retail "charm" pricing: round to the nearest $10, then subtract $1. */
export function charm(cents: Cents): Cents {
  const tens = Math.max(1, Math.round(cents / 1000));
  return tens * 1000 - 100;
}

export function dollars(n: number): Cents {
  return Math.round(n * 100);
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
