import "server-only";
import type { Listing, MerchantId, Offer } from "../types";
import { appendRecord, readLedger } from "./ledger";

/**
 * Agent trust intelligence. Each agent (the buyer agent and each store agent)
 * has its own score, computed only from behaviour the server observed and
 * wrote to the ledger. What an agent says about itself is never an input;
 * claiming to be "trusted" or "verified" is itself a warning sign.
 *
 * score = 100 − Σ weight × 0.5^(age in days / 7), floored at 0.
 * Trusted ≥ 80 · Watch 50–79 · Restricted < 50 (a restricted store agent is
 * paused from negotiations on the server).
 */

export type AgentRef = "buyer" | MerchantId;
export const AGENTS: AgentRef[] = ["buyer", "atelier", "bolt", "cove"];

export type TrustEventKind =
  | "auth-failure"
  | "guardrail-rejection"
  | "floor-probe"
  | "price-inconsistency"
  | "self-reported-reputation"
  | "manipulation-attempt"
  | "repeated-manipulation"
  | "indirect-injection";

export const TRUST_WEIGHTS: Record<TrustEventKind, number> = {
  "auth-failure": 8,
  "guardrail-rejection": 10,
  "floor-probe": 12,
  "price-inconsistency": 20,
  "self-reported-reputation": 6,
  "manipulation-attempt": 5,
  "repeated-manipulation": 15,
  "indirect-injection": 25,
};

export const TRUST_LABEL: Record<TrustEventKind, string> = {
  "auth-failure": "Failed sign-in",
  "guardrail-rejection": "AI message rejected for wrong numbers",
  "floor-probe": "Tried to price below its own floor",
  "price-inconsistency": "Inconsistent price or discount",
  "self-reported-reputation": "Claimed its own reputation",
  "manipulation-attempt": "Manipulation attempt in a conversation",
  "repeated-manipulation": "Repeated manipulation in one conversation",
  "indirect-injection": "Hidden instructions in its content",
};

export interface TrustEvent {
  agent: AgentRef;
  kind: TrustEventKind;
  weight: number;
  detail: string;
  ref: string | null;
}

export interface TrustReport {
  agent: AgentRef;
  score: number;
  level: "trusted" | "watch" | "restricted";
  events: Array<TrustEvent & { at: string }>;
  counts: Partial<Record<TrustEventKind, number>>;
}

const HALF_LIFE_DAYS = 7;

export function recordTrustEvent(agent: AgentRef, kind: TrustEventKind, detail: string, ref: string | null = null) {
  appendRecord("trust-event", { agent, kind, weight: TRUST_WEIGHTS[kind], detail, ref } satisfies TrustEvent);
}

export function trustReport(agent: AgentRef, now = Date.now()): TrustReport {
  const records = readLedger<TrustEvent>("trust-event", 5000).filter((r) => r.data.agent === agent);
  let penalty = 0;
  const counts: TrustReport["counts"] = {};
  for (const r of records) {
    const ageDays = Math.max(0, (now - Date.parse(r.at)) / 86_400_000);
    penalty += r.data.weight * 0.5 ** (ageDays / HALF_LIFE_DAYS);
    counts[r.data.kind] = (counts[r.data.kind] ?? 0) + 1;
  }
  const score = Math.max(0, Math.round(100 - penalty));
  return {
    agent,
    score,
    level: score >= 80 ? "trusted" : score >= 50 ? "watch" : "restricted",
    events: records.slice(0, 12).map((r) => ({ ...r.data, at: r.at })),
    counts,
  };
}

export const isRestricted = (agent: AgentRef) => trustReport(agent).level === "restricted";

/** Count of an agent's events of some kinds since a time (for lockouts and repeat detection). */
export function recentTrustEvents(agent: AgentRef, kinds: TrustEventKind[], sinceMs: number, ref?: string): number {
  return readLedger<TrustEvent>("trust-event", 5000).filter(
    (r) => r.data.agent === agent && kinds.includes(r.data.kind) && Date.parse(r.at) >= sinceMs && (ref === undefined || r.data.ref === ref),
  ).length;
}

const SELF_REPUTATION =
  /\b(trusted|verified|certified|top[- ]rated|5[- ]star|five[- ]star|official|guaranteed|award[- ]winning)\s+(seller|merchant|store|partner|agent|vendor)\b|\btrust (score|rating)\b|\b(i am|i'm|we are|we're)\s+(a\s+)?(fully\s+)?(trusted|verified|certified)\b/i;

export const claimsReputation = (text: string) => SELF_REPUTATION.test(text);

export interface OfferFinding {
  kind: TrustEventKind;
  detail: string;
}

/**
 * Checks a store agent's offer against the registered listing and its own
 * words: list price must match the listing, price must stay within list and
 * the store's maximum, any "N% off" claim must match the real discount, and
 * the message must not claim reputation. Also reports guardrail flags the
 * policy engine raised while building the offer.
 */
export function inspectOffer(offer: Offer, listing: Pick<Listing, "listPriceCents" | "maxSellingPriceCents"> | null): OfferFinding[] {
  const out: OfferFinding[] = [];
  const t = offer.terms;
  if (t && listing) {
    if (t.listPriceCents !== listing.listPriceCents) out.push({ kind: "price-inconsistency", detail: `Quoted list price differs from the registered listing.` });
    if (t.unitPriceCents > listing.maxSellingPriceCents || t.unitPriceCents <= 0) out.push({ kind: "price-inconsistency", detail: "Unit price is outside the listing's allowed range." });
    const claimed = /\b(\d{1,2}(?:\.\d)?)\s*%\s*off\b/i.exec(offer.message);
    if (claimed && t.listPriceCents > 0) {
      const real = (1 - t.unitPriceCents / t.listPriceCents) * 100;
      if (Math.abs(Number(claimed[1]) - real) > 1 && !/you asked for/i.test(offer.message.slice(0, claimed.index + 20))) {
        out.push({ kind: "price-inconsistency", detail: `Claimed ${claimed[1]}% off; the real discount is ${Math.round(real)}%.` });
      }
    }
  }
  if (claimsReputation(offer.message)) out.push({ kind: "self-reported-reputation", detail: "Offer message claims its own reputation; ignored and noted." });
  if (offer.guardrail?.messageRejected) out.push({ kind: "guardrail-rejection", detail: "AI-written message quoted numbers that weren't in the offer; replaced." });
  if (offer.guardrail?.priceClamped) out.push({ kind: "floor-probe", detail: "AI proposed a price past the store's own limit; clamped." });
  return out;
}
