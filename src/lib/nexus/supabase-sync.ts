import "server-only";

/**
 * Supabase persistence for server data: sessions (deals), orders, PayPal
 * webhook ids and the security ledger. Uses Supabase's REST API with the
 * server-only SECRET key (never the browser's publishable key), because these
 * tables hold private data such as store floor prices and payment details.
 *
 * Write-through: the in-memory store stays the working copy, so requests stay
 * fast and behave exactly as before; every change is also saved here, and
 * deals and orders are read back from here after a restart.
 *
 * On only when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set and
 * NEXUS_SUPABASE isn't "off" (tests turn it off so they never touch real data).
 * A Supabase outage never breaks a request: failures are logged (without
 * secrets) and the app carries on from memory.
 */

const TIMEOUT_MS = 4_000;

interface Config {
  url: string;
  key: string;
}

export function supabaseConfig(): Config | null {
  if (process.env.NEXUS_SUPABASE === "off") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) return null;
  return { url, key };
}

export const supabaseEnabled = () => supabaseConfig() !== null;

let lastError: string | null = null;
export const supabaseLastError = () => lastError;

function warn(what: string, detail: string) {
  lastError = `${what}: ${detail}`.slice(0, 300);
  console.warn(`[supabase] ${lastError}`);
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const headers: Record<string, string> = { apikey: cfg.key, "Content-Type": "application/json", Accept: "application/json" };
  if (init.prefer) headers.Prefer = init.prefer;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      warn(`${init.method ?? "GET"} ${path.split("?")[0]}`, `HTTP ${res.status} ${body}`);
      return null;
    }
    lastError = null;
    return res;
  } catch (err) {
    warn(`${init.method ?? "GET"} ${path.split("?")[0]}`, err instanceof Error ? err.message : "request failed");
    return null;
  }
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- sessions and orders

interface SessionLike {
  id: string;
  status: string;
  negotiationRun?: number;
  createdAt: string;
  updatedAt?: string;
}

interface OrderLike {
  id: string;
  sessionId: string;
  merchantId: string;
  status: string;
  totalCents: number;
  termsHash: string;
  createdAt: string;
  updatedAt?: string;
  payment?: { paypalOrderId?: string | null } | null;
}

export async function upsertSession(s: SessionLike): Promise<boolean> {
  const row = { id: s.id, status: s.status, negotiation_run: s.negotiationRun ?? 0, data: s, created_at: s.createdAt, updated_at: s.updatedAt ?? new Date().toISOString() };
  return Boolean(await rest("sessions?on_conflict=id", { method: "POST", body: JSON.stringify(row), prefer: "resolution=merge-duplicates,return=minimal" }));
}

export async function upsertOrder(o: OrderLike): Promise<boolean> {
  const row = {
    id: o.id,
    session_id: o.sessionId,
    merchant_id: o.merchantId,
    status: o.status,
    total_cents: o.totalCents,
    terms_hash: o.termsHash,
    paypal_order_id: o.payment?.paypalOrderId ?? null,
    data: o,
    created_at: o.createdAt,
    updated_at: o.updatedAt ?? new Date().toISOString(),
  };
  return Boolean(await rest("orders?on_conflict=id", { method: "POST", body: JSON.stringify(row), prefer: "resolution=merge-duplicates,return=minimal" }));
}

async function readData<T>(path: string): Promise<T[]> {
  const res = await rest(path);
  if (!res) return [];
  try {
    const rows = (await res.json()) as Array<{ data: T }>;
    return Array.isArray(rows) ? rows.map((r) => r.data).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const fetchSession = async <T>(id: string) => (await readData<T>(`sessions?id=eq.${enc(id)}&select=data&limit=1`))[0] ?? null;
export const fetchOrder = async <T>(id: string) => (await readData<T>(`orders?id=eq.${enc(id)}&select=data&limit=1`))[0] ?? null;
export const fetchOrderByPayPalId = async <T>(paypalOrderId: string) => (await readData<T>(`orders?paypal_order_id=eq.${enc(paypalOrderId)}&select=data&limit=1`))[0] ?? null;
export const fetchOrderByCaptureId = async <T>(captureId: string) => (await readData<T>(`orders?data->payment->>captureId=eq.${enc(captureId)}&select=data&limit=1`))[0] ?? null;
export const fetchRecentSessions = <T>(limit: number) => readData<T>(`sessions?select=data&order=created_at.desc&limit=${Math.max(1, Math.min(200, limit))}`);
export const fetchRecentOrders = <T>(limit: number) => readData<T>(`orders?select=data&order=created_at.desc&limit=${Math.max(1, Math.min(200, limit))}`);

// ---------------------------------------------------------------- webhooks

/**
 * Records a PayPal webhook event id. True if it's new, false if it was seen
 * before, null if Supabase couldn't answer (the caller falls back to memory).
 */
export async function recordWebhookEvent(eventId: string): Promise<boolean | null> {
  const res = await rest("webhook_events?on_conflict=event_id", { method: "POST", body: JSON.stringify({ event_id: eventId }), prefer: "resolution=ignore-duplicates,return=representation" });
  if (!res) return null;
  try {
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- security ledger

export interface LedgerRow {
  seq: number;
  at: string;
  kind: string;
  data: unknown;
  prevHash: string;
  hash: string;
}

/** Copies one already-redacted, hash-chained record to the append-only table. */
export async function appendSecurityRecord(r: LedgerRow): Promise<boolean> {
  const row = { seq: r.seq, at: r.at, kind: r.kind, data: r.data, prev_hash: r.prevHash, hash: r.hash };
  return Boolean(await rest("security_ledger", { method: "POST", body: JSON.stringify(row), prefer: "resolution=ignore-duplicates,return=minimal" }));
}

// ---------------------------------------------------------------- status

export interface SupabaseStatus {
  configured: boolean;
  reachable: boolean;
  tables: Record<"sessions" | "orders" | "webhook_events" | "security_ledger", boolean>;
  error: string | null;
  /** How long one small query takes from this server, in ms (shows how far the database is). */
  latencyMs?: number | null;
}

/** Checks the project answers and which tables exist (for the Settings page). */
export async function supabaseStatus(): Promise<SupabaseStatus> {
  const names = ["sessions", "orders", "webhook_events", "security_ledger"] as const;
  const tables = { sessions: false, orders: false, webhook_events: false, security_ledger: false };
  if (!supabaseEnabled()) return { configured: false, reachable: false, tables, error: null };
  const started = performance.now();
  const results = await Promise.all(names.map((t) => rest(`${t}?select=*&limit=0`)));
  const latencyMs = Math.round(performance.now() - started);
  names.forEach((t, i) => (tables[t] = Boolean(results[i])));
  // An HTTP error (like "table not found") still means the project answered; a network error means it didn't.
  const reachable = results.some(Boolean) || /HTTP \d{3}/.test(lastError ?? "");
  return { configured: true, reachable, tables, error: lastError, latencyMs };
}
