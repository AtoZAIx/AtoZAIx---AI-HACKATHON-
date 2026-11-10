import type { Cents } from "../types";

/**
 * True when every dollar amount mentioned in `text` is one of the `allowed`
 * amounts (within rounding). Used to reject LLM narration that misstates the
 * numbers the policy engine actually produced. Zero amounts are ignored as
 * anchors so "$1" can't sneak through by rounding against "free shipping".
 */
export function numbersConsistent(text: string, allowed: Cents[]): boolean {
  const anchors = allowed.filter((a) => a > 0);
  // Dollars, rupees (with lakh grouping like 1,50,000), euros and pounds.
  const found = [...text.matchAll(/[$₹€£]\s?(\d[\d,]*(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 100));
  return found.every((amount) => anchors.some((a) => Math.abs(a - amount) < 100));
}
