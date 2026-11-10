import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendRecord } from "@/lib/nexus/security/ledger";
import { store } from "@/lib/nexus/store";
import { supabaseEnabled, supabaseLastError, supabaseStatus } from "@/lib/nexus/supabase-sync";
import type { CommerceSession, NexusOrder } from "@/lib/nexus/types";

/**
 * A fake Supabase REST API in memory, so these tests never touch a real
 * project. It understands just what supabase-sync.ts sends.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: Array<{ method: string; table: string; headers: Record<string, string>; body?: Row }> = [];
let down = false;
const missing = new Set<string>();

const fakeFetch = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
  if (down) throw new TypeError("fetch failed");
  const url = new URL(String(input));
  const table = url.pathname.replace("/rest/v1/", "");
  const method = init.method ?? "GET";
  const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
  const body = init.body ? (JSON.parse(String(init.body)) as Row) : undefined;
  calls.push({ method, table, headers, body });
  if (missing.has(table)) return new Response(JSON.stringify({ code: "PGRST205", message: `Could not find the table 'public.${table}'` }), { status: 404 });
  const rows = (tables[table] ??= []);
  const key = table === "webhook_events" ? "event_id" : table === "security_ledger" ? "seq" : "id";
  if (method === "POST") {
    if (table === "orders" && !(tables.sessions ?? []).some((s) => s.id === body!.session_id)) return new Response(JSON.stringify({ message: "violates foreign key" }), { status: 409 });
    const at = rows.findIndex((r) => r[key] === body![key]);
    const ignore = headers.Prefer?.includes("ignore-duplicates");
    if (at >= 0 && ignore) return new Response("[]", { status: 201 });
    if (at >= 0) rows[at] = { ...rows[at], ...body };
    else rows.push(body!);
    return new Response(headers.Prefer?.includes("return=representation") ? JSON.stringify([body]) : "", { status: 201 });
  }
  const filters = [...url.searchParams.entries()].filter(([k]) => !["select", "limit", "order"].includes(k));
  let out = rows.filter((r) => filters.every(([k, v]) => String(r[k]) === v.replace(/^eq\./, "")));
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  out = out.slice(0, limit);
  return new Response(JSON.stringify(out), { status: 200 });
});

const session = (id: string) => ({ id, status: "negotiating", createdAt: "2026-11-11T10:00:00.000Z", intent: { text: "MacBook" } }) as unknown as CommerceSession;
const order = (id: string, sessionId: string) =>
  ({ id, sessionId, merchantId: "bolt", status: "awaiting_approval", totalCents: 99_900, termsHash: "a".repeat(64), createdAt: "2026-11-11T10:01:00.000Z", payment: { paypalOrderId: "PP-1" } }) as unknown as NexusOrder;

describe("Supabase sync (against a fake Supabase)", () => {
  const env = { ...process.env };
  beforeEach(async () => {
    for (const k of Object.keys(tables)) delete tables[k];
    calls.length = 0;
    down = false;
    missing.clear();
    process.env.NEXUS_SUPABASE = "on";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testproject.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_TESTKEY_never_real";
    vi.stubGlobal("fetch", fakeFetch);
    await store.reset();
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("is off unless the URL and the secret key are set, and always off in tests by default", () => {
    expect(supabaseEnabled()).toBe(true);
    process.env.NEXUS_SUPABASE = "off";
    expect(supabaseEnabled()).toBe(false);
    process.env.NEXUS_SUPABASE = "on";
    delete process.env.SUPABASE_SECRET_KEY;
    expect(supabaseEnabled()).toBe(false); // the publishable key alone never writes
    process.env.SUPABASE_SECRET_KEY = "sb_secret_x";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evil.example.com";
    expect(supabaseEnabled()).toBe(false);
    expect(env.NEXUS_SUPABASE).toBe("off"); // vitest config
  });

  it("saves an order after its session, with the secret key only in the apikey header", async () => {
    await store.saveSession(session("ses_1"));
    await store.saveOrder(order("ord_1", "ses_1"));
    expect(tables.sessions).toEqual([expect.objectContaining({ id: "ses_1", status: "negotiating", data: expect.objectContaining({ id: "ses_1" }) })]);
    expect(tables.orders).toEqual([expect.objectContaining({ id: "ord_1", session_id: "ses_1", merchant_id: "bolt", total_cents: 99_900, paypal_order_id: "PP-1" })]);
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes.map((c) => c.table)).toEqual(["sessions", "orders"]);
    expect(writes.every((c) => c.headers.apikey === "sb_secret_TESTKEY_never_real" && !c.headers.Authorization)).toBe(true);
  });

  it("batches bursts of session updates into one write", async () => {
    await store.saveSession(session("ses_2"));
    for (let i = 0; i < 10; i++) await store.updateSession("ses_2", (s) => void (s.status = `step-${i}` as CommerceSession["status"]));
    await new Promise((r) => setTimeout(r, 350));
    const writes = calls.filter((c) => c.method === "POST" && c.table === "sessions");
    expect(writes).toHaveLength(1);
    expect(tables.sessions[0].status).toBe("step-9");
  });

  it("reads deals and orders back after a restart", async () => {
    await store.saveSession(session("ses_3"));
    await store.saveOrder(order("ord_3", "ses_3"));
    await store.reset(); // server restart: memory is gone
    expect((await store.getOrder("ord_3"))?.totalCents).toBe(99_900);
    expect((await store.getSession("ses_3"))?.id).toBe("ses_3");
    expect((await store.findOrderByPayPalId("PP-1"))?.id).toBe("ord_3");
    await store.reset();
    expect((await store.listOrders()).map((o) => o.id)).toEqual(["ord_3"]);
  });

  it("blocks a replayed PayPal webhook even after a restart", async () => {
    expect(await store.markWebhookEvent("WH-1")).toBe(true);
    expect(await store.markWebhookEvent("WH-1")).toBe(false);
    await store.reset();
    expect(await store.markWebhookEvent("WH-1")).toBe(false); // the database remembers
  });

  it("keeps working from memory when Supabase is down, without leaking the key", async () => {
    down = true;
    await store.saveSession(session("ses_4"));
    await expect(store.saveOrder(order("ord_4", "ses_4"))).resolves.toBeUndefined();
    expect((await store.getOrder("ord_4"))?.id).toBe("ord_4");
    expect(await store.markWebhookEvent("WH-2")).toBe(true);
    expect(supabaseLastError()).toMatch(/fetch failed/);
    expect(supabaseLastError()).not.toContain("sb_secret");
  });

  it("copies security records to the append-only ledger table, already redacted", async () => {
    const rec = appendRecord("security-event", { note: "card 4111 1111 1111 1111 used", key: process.env.SUPABASE_SECRET_KEY! });
    await new Promise((r) => setTimeout(r, 20));
    const row = tables.security_ledger.find((r) => r.seq === rec.seq)!;
    expect(row).toMatchObject({ kind: "security-event", hash: rec.hash, prev_hash: rec.prevHash });
    expect(JSON.stringify(row)).not.toContain("4111 1111");
    expect(JSON.stringify(row)).not.toContain("sb_secret_TESTKEY");
  });

  it("reports which tables are missing on the Settings page", async () => {
    missing.add("security_ledger");
    const st = await supabaseStatus();
    expect(st).toMatchObject({ configured: true, reachable: true, tables: { sessions: true, orders: true, webhook_events: true, security_ledger: false } });
    down = true;
    expect((await supabaseStatus()).reachable).toBe(false);
  });
});
