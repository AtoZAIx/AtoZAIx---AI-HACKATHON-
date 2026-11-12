// Vercel runs many short-lived copies of the app; any request can land on any copy.
// These tests imitate two copies ("servers") sharing one Supabase, using a fake Supabase in memory.
import { mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const remote = { sessions: new Map<string, unknown>(), orders: new Map<string, unknown>(), events: new Set<string>(), reads: 0, writes: 0, lists: 0 };
const copy = <T,>(v: T): T => structuredClone(v);

vi.mock("@/lib/nexus/supabase-sync", () => ({
  supabaseEnabled: () => true,
  supabaseConfig: () => ({ url: "https://fake.supabase.co", key: "x" }),
  supabaseLastError: () => null,
  upsertSession: async (s: { id: string }) => (remote.writes++, remote.sessions.set(s.id, copy(s)), true),
  upsertOrder: async (o: { id: string }) => (remote.orders.set(o.id, copy(o)), true),
  fetchSession: async (id: string) => (remote.reads++, copy(remote.sessions.get(id) ?? null)),
  fetchOrder: async (id: string) => copy(remote.orders.get(id) ?? null),
  fetchOrderByPayPalId: async (pp: string) => copy([...remote.orders.values()].find((o) => (o as { payment?: { paypalOrderId?: string } }).payment?.paypalOrderId === pp) ?? null),
  fetchOrderByCaptureId: async (c: string) => copy([...remote.orders.values()].find((o) => (o as { payment?: { captureId?: string } }).payment?.captureId === c) ?? null),
  fetchRecentSessions: async () => (remote.lists++, [...remote.sessions.values()].map(copy)),
  fetchRecentOrders: async () => [...remote.orders.values()].map(copy),
  recordWebhookEvent: async (id: string) => (remote.events.has(id) ? false : (remote.events.add(id), true)),
  appendSecurityRecord: async () => true,
  supabaseStatus: async () => ({ configured: true, ok: true }),
}));

const { store } = await import("@/lib/nexus/store");
const { createSession, lockDealAndPrepareOrder, streamNegotiation } = await import("@/lib/nexus/service");

/** Switching "server": a fresh copy of the app has nothing in memory. */
const otherServer = () => {
  delete (globalThis as { __nexusStore?: unknown }).__nexusStore;
};

beforeEach(() => {
  process.env.NEXUS_SHARED_STORE = "1";
  remote.sessions.clear();
  remote.orders.clear();
  otherServer();
});
afterEach(() => {
  delete process.env.NEXUS_SHARED_STORE;
  delete process.env.VERCEL;
});

describe("on Vercel (shared mode), every copy of the app sees the same deals", () => {
  it("negotiate on one server, choose the deal on another, open the order on a third", async () => {
    const { session } = await createSession("noise cancelling headphones for travel under $400");
    otherServer();
    for await (const e of streamNegotiation(session.id)) void e;
    otherServer(); // the "Choose this deal" click lands somewhere else
    const done = (await store.getSession(session.id))!;
    expect(done.result?.recommendedOfferId).toBeTruthy();
    const { order } = await lockDealAndPrepareOrder(session.id, done.result!.recommendedOfferId!);
    otherServer();
    expect((await store.getOrder(order.id))?.status).toBe("awaiting_approval");
  });

  it("a live negotiation doesn't re-read Supabase for every message, and its result is saved before it's shown", async () => {
    const { session } = await createSession("noise cancelling headphones for travel under $400");
    remote.reads = 0;
    remote.writes = 0;
    let events = 0;
    let savedWhenShown = false;
    for await (const e of streamNegotiation(session.id)) {
      events++;
      if (e.type === "result") savedWhenShown = (remote.sessions.get(session.id) as { status: string }).status === "negotiated";
    }
    expect(events).toBeGreaterThan(20);
    expect(remote.reads).toBeLessThan(5); // was one read per message
    expect(savedWhenShown).toBe(true); // "Choose this deal" on another server finds the result
    otherServer();
    expect((await store.getSession(session.id))?.status).toBe("negotiated");
  });

  it("lists of deals are fetched once and reused for a few seconds, and fresh again after any save", async () => {
    const { session } = await createSession("noise cancelling headphones for travel under $400");
    remote.lists = 0;
    await store.listSessions(20);
    await store.listSessions(20); // the notifications bell and the page ask for the same list
    expect(remote.lists).toBe(1);
    await store.updateSession(session.id, (s) => void (s.negotiationRun = 7));
    expect((await store.listSessions(20)).find((s) => s.id === session.id)?.negotiationRun).toBe(7);
    expect(remote.lists).toBe(2);
  });

  it("a server with an old copy in memory reads the latest one, and doesn't overwrite newer changes", async () => {
    const { session } = await createSession("noise cancelling headphones for travel under $400");
    await store.getSession(session.id); // server A keeps a copy in memory
    const a = (globalThis as { __nexusStore?: unknown }).__nexusStore;
    otherServer();
    await store.updateSession(session.id, (s) => void (s.negotiationRun = 42)); // changed on server B
    (globalThis as { __nexusStore?: unknown }).__nexusStore = a; // back on server A, with its stale copy
    expect((await store.getSession(session.id))?.negotiationRun).toBe(42);
    await store.updateSession(session.id, (s) => void (s.status = s.status));
    expect((remote.sessions.get(session.id) as { negotiationRun: number }).negotiationRun).toBe(42);
  });

  it("refund and dispute webhooks find the order by PayPal's capture id on a server that never saw it", async () => {
    remote.orders.set("ord_x", { id: "ord_x", status: "confirmed", payment: { captureId: "CAP-123", paypalOrderId: "PP-1" } });
    expect((await store.findOrderByCaptureId("CAP-123"))?.id).toBe("ord_x");
  });
});

describe("Vercel safety checks", () => {
  it("the audit log never breaks a request when the disk is read-only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ro-"));
    chmodSync(dir, 0o500);
    process.env.NEXUS_DATA_DIR = join(dir, "nested");
    delete (globalThis as { __nexusLedger?: unknown }).__nexusLedger;
    const { appendRecord } = await import("@/lib/nexus/security/ledger");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => appendRecord("security-event", { note: "read-only disk" })).not.toThrow();
    spy.mockRestore();
    delete process.env.NEXUS_DATA_DIR;
    delete (globalThis as { __nexusLedger?: unknown }).__nexusLedger;
  });

  it("on Vercel a missing signing secret is a clear error, not a silent per-server key", async () => {
    const saved = process.env.NEXUS_SIGNING_SECRET;
    delete process.env.NEXUS_SIGNING_SECRET;
    delete (globalThis as { __nexusSigningSecret?: string }).__nexusSigningSecret;
    process.env.VERCEL = "1";
    const { hmac } = await import("@/lib/nexus/signing");
    expect(() => hmac("x")).toThrow(/NEXUS_SIGNING_SECRET is not set/);
    process.env.NEXUS_SIGNING_SECRET = "a-shared-secret-for-every-server";
    expect(hmac("x")).toMatch(/^[0-9a-f]{64}$/);
    if (saved) process.env.NEXUS_SIGNING_SECRET = saved;
    else delete process.env.NEXUS_SIGNING_SECRET;
  });
});
