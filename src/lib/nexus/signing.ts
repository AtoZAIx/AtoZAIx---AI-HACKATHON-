import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OfferTerms } from "./types";

const g = globalThis as unknown as { __nexusSigningSecret?: string };

function secret(): string {
  if (process.env.NEXUS_SIGNING_SECRET) return process.env.NEXUS_SIGNING_SECRET;
  // Dev fallback: a per-process secret. Set NEXUS_SIGNING_SECRET in production.
  g.__nexusSigningSecret ??= randomBytes(32).toString("hex");
  return g.__nexusSigningSecret;
}

/** Deterministic JSON with sorted keys, so equal terms always hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function hashTerms(terms: OfferTerms): string {
  return createHash("sha256").update(canonicalJson(terms)).digest("hex");
}

export function signAgreement(sessionId: string, offerId: string, termsHash: string): string {
  return createHmac("sha256", secret()).update(`${sessionId}|${offerId}|${termsHash}`).digest("hex");
}

export function verifyAgreementSignature(sessionId: string, offerId: string, termsHash: string, signature: string): boolean {
  const expected = Buffer.from(signAgreement(sessionId, offerId, termsHash), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Generic HMAC for short-lived signed tokens (e.g. role cookies). */
export function hmac(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
