import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalJson, hmac } from "../signing";
import type { NexusOrder } from "../types";

/**
 * Payment security primitives, all enforced on the server:
 *  - signed approvals bound to the exact amount, currency, store, terms and version, with a time limit;
 *  - server-side idempotency for payment endpoints;
 *  - webhook freshness (replay window).
 */

export const APPROVAL_TTL_MS = 30 * 60 * 1000;
export const WEBHOOK_MAX_AGE_MS = 10 * 60 * 1000;
export const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

type Approval = NonNullable<NexusOrder["approval"]>;

function approvalPayload(orderId: string, a: Omit<Approval, "signature">) {
  return canonicalJson({
    orderId,
    amountCents: a.amountCents,
    currency: a.currency,
    merchantId: a.merchantId,
    termsHash: a.termsHash,
    agreementVersion: a.agreementVersion,
    approvedAt: a.approvedAt,
    expiresAt: a.expiresAt,
  });
}

export function signApproval(orderId: string, a: Omit<Approval, "signature">): string {
  return hmac(`approval|${approvalPayload(orderId, a)}`);
}

export interface ApprovalCheck {
  ok: boolean;
  kind: "missing" | "expired" | "tampered" | null;
  reason: string | null;
}

/** The approval must be signed by this server and still match the order exactly. */
export function verifyApproval(order: Pick<NexusOrder, "id" | "approval" | "totalCents" | "currency" | "merchantId" | "termsHash" | "agreementVersion">, now = Date.now()): ApprovalCheck {
  const a = order.approval;
  if (!a) return { ok: false, kind: "missing", reason: "The order hasn't been approved." };
  if (!a.signature || !a.expiresAt || !a.merchantId || !a.currency) return { ok: false, kind: "tampered", reason: "The approval isn't signed. Approve again." };
  const { signature, ...rest } = a;
  const expected = Buffer.from(signApproval(order.id, rest), "hex");
  const given = Buffer.from(signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, kind: "tampered", reason: "The approval signature doesn't match. It may have been modified." };
  }
  if (a.amountCents !== order.totalCents) return { ok: false, kind: "tampered", reason: "The amount changed after approval." };
  if (a.currency !== order.currency) return { ok: false, kind: "tampered", reason: "The currency changed after approval." };
  if (a.merchantId !== order.merchantId) return { ok: false, kind: "tampered", reason: "The store changed after approval." };
  if (a.termsHash !== order.termsHash || a.agreementVersion !== order.agreementVersion) {
    return { ok: false, kind: "tampered", reason: "The deal terms changed after approval." };
  }
  if (Date.parse(a.expiresAt) < now) return { ok: false, kind: "expired", reason: "Your approval expired. Review and approve again." };
  return { ok: true, kind: null, reason: null };
}

// ---------------------------------------------------------------- idempotency

interface Entry {
  fingerprint: string;
  expires: number;
  pending?: Promise<unknown>;
  result?: unknown;
}

const g = globalThis as unknown as { __nexusIdem?: Map<string, Entry> };
const IDEM_TTL_MS = 24 * 3600_000;
const entries = () => (g.__nexusIdem ??= new Map());

export class IdempotencyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Runs `fn` once per (scope, key). A repeat with the same request returns the
 * first result without re-executing; a repeat with a different request is
 * rejected. Concurrent repeats wait for the first. Failures aren't cached, so
 * a failed request can be retried.
 */
export async function idempotent<T>(scope: string, key: string | null, request: string, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw new IdempotencyError("Idempotency-Key must be 8–128 letters, digits or _ . : -", 400);
  const map = entries();
  const now = Date.now();
  for (const [k, e] of map) if (e.expires < now) map.delete(k);
  const id = `${scope}|${key}`;
  const fingerprint = createHash("sha256").update(`${scope}|${request}`).digest("hex");
  const existing = map.get(id);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new IdempotencyError("This Idempotency-Key was already used for a different request.", 422);
    if (existing.pending) return existing.pending as Promise<T>;
    return existing.result as T;
  }
  const entry: Entry = { fingerprint, expires: now + IDEM_TTL_MS };
  entry.pending = fn().then(
    (result) => {
      entry.result = result;
      entry.pending = undefined;
      return result;
    },
    (err) => {
      map.delete(id);
      throw err;
    },
  );
  map.set(id, entry);
  return entry.pending as Promise<T>;
}

// ---------------------------------------------------------------- webhooks

/** PayPal transmission time must be recent: rejects replays of old, validly signed messages. */
export function webhookFresh(transmissionTime: string | null, now = Date.now()): boolean {
  if (!transmissionTime) return false;
  const t = Date.parse(transmissionTime);
  if (Number.isNaN(t)) return false;
  return now - t <= WEBHOOK_MAX_AGE_MS && t - now <= WEBHOOK_MAX_SKEW_MS;
}
