import "server-only";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendSecurityRecord, supabaseEnabled } from "../supabase-sync";

/**
 * Persistent, append-only, hash-chained security ledger.
 *
 * Every record carries the SHA-256 of the previous record, so editing or
 * deleting any line breaks the chain and `verifyLedger()` reports where.
 * Records are redacted before writing: card numbers, CVVs, bearer tokens and
 * configured secrets never reach disk.
 *
 * Storage: a JSONL file under NEXUS_DATA_DIR (default `.nexus-data/`). It
 * survives server restarts and demo resets. On serverless hosts with no
 * persistent disk: with Supabase configured, every record is also copied to
 * the append-only table in supabase/migrations/0002_security_ledger.sql
 * (insert-only by grants and a trigger).
 */

export type LedgerKind = "security-event" | "risk-decision" | "trust-event";

export interface LedgerRecord<T = Record<string, unknown>> {
  seq: number;
  at: string;
  kind: LedgerKind;
  data: T;
  prevHash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);
const g = globalThis as unknown as { __nexusLedger?: { file: string; seq: number; lastHash: string; records: LedgerRecord[] } };

function dataDir() {
  return process.env.NEXUS_DATA_DIR || join(process.cwd(), ".nexus-data");
}

const hashOf = (r: Omit<LedgerRecord, "hash">) => createHash("sha256").update(JSON.stringify([r.seq, r.at, r.kind, r.data, r.prevHash])).digest("hex");

function state() {
  const file = join(dataDir(), "security-ledger.jsonl");
  if (!g.__nexusLedger || g.__nexusLedger.file !== file) {
    const records: LedgerRecord[] = [];
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          records.push(JSON.parse(line));
        } catch {
          // A corrupt line is kept out of memory; verifyLedger() will flag the gap.
        }
      }
    }
    const last = records.at(-1);
    g.__nexusLedger = { file, seq: last?.seq ?? 0, lastHash: last?.hash ?? GENESIS, records };
  }
  return g.__nexusLedger;
}

// ---------------------------------------------------------------- redaction

function secretValues(): string[] {
  return ["PAYPAL_CLIENT_SECRET", "PAYPAL_CLIENT_ID", "GEMINI_API_KEY", "NEXUS_SIGNING_SECRET", "NEXUS_SIM_WEBHOOK_SECRET", "SUPABASE_SECRET_KEY"]
    .map((k) => process.env[k])
    .filter((v): v is string => typeof v === "string" && v.length >= 8);
}

/** Removes card numbers, CVVs, tokens and configured secrets from any text. */
export function redact(text: string): string {
  let out = text;
  for (const s of secretValues()) out = out.split(s).join("[secret redacted]");
  return out
    .replace(/\b(?:\d[ -]?){12,19}\b/g, "[card number redacted]")
    .replace(/\b(cvv2?|cvc|security code)\s*[:=]?\s*\d{3,4}\b/gi, "$1 [redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/g, "Bearer [redacted]")
    .replace(/\b(client_secret|access_token|api[_-]?key|password|passcode)\b\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function redactDeep<T>(v: T): T {
  if (typeof v === "string") return redact(v) as T;
  if (Array.isArray(v)) return v.map(redactDeep) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)])) as T;
  return v;
}

// ---------------------------------------------------------------- API

export function appendRecord<T extends Record<string, unknown>>(kind: LedgerKind, data: T, at = new Date().toISOString()): LedgerRecord<T> {
  const s = state();
  const base = { seq: s.seq + 1, at, kind, data: redactDeep(data), prevHash: s.lastHash };
  const record = { ...base, hash: hashOf(base) } as LedgerRecord<T>;
  mkdirSync(dataDir(), { recursive: true });
  appendFileSync(s.file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  s.seq = record.seq;
  s.lastHash = record.hash;
  s.records.push(record as LedgerRecord);
  // Mirror to Supabase's append-only table (already redacted and hash-chained). Never blocks or fails the caller.
  if (supabaseEnabled()) void appendSecurityRecord(record);
  return record;
}

/** Newest first. */
export function readLedger<T = Record<string, unknown>>(kind?: LedgerKind, limit = 500): LedgerRecord<T>[] {
  const all = state().records;
  const out: LedgerRecord<T>[] = [];
  for (let i = all.length - 1; i >= 0 && out.length < limit; i--) if (!kind || all[i].kind === kind) out.push(all[i] as LedgerRecord<T>);
  return out;
}

/** Re-reads the file from disk and checks every link of the hash chain. */
export function verifyLedger(): { ok: boolean; records: number; brokenAt: number | null; reason: string | null } {
  const file = state().file;
  if (!existsSync(file)) return { ok: true, records: 0, brokenAt: null, reason: null };
  const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let r: LedgerRecord;
    try {
      r = JSON.parse(lines[i]);
    } catch {
      return { ok: false, records: lines.length, brokenAt: i + 1, reason: "Unreadable record" };
    }
    if (r.seq !== i + 1) return { ok: false, records: lines.length, brokenAt: i + 1, reason: "Missing or reordered record" };
    if (r.prevHash !== prev) return { ok: false, records: lines.length, brokenAt: i + 1, reason: "Chain link doesn't match the previous record" };
    const { hash, ...rest } = r;
    if (hashOf(rest) !== hash) return { ok: false, records: lines.length, brokenAt: i + 1, reason: "Record was modified" };
    prev = hash;
  }
  return { ok: true, records: lines.length, brokenAt: null, reason: null };
}

/** Test helper: forget the in-memory view so the file is re-read. */
export function reloadLedger() {
  g.__nexusLedger = undefined;
}
