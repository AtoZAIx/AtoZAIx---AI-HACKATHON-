import "server-only";
import { seedListings } from "./inventory";
import { SEED_POLICIES } from "./merchants";
import { appendRecord, readLedger } from "./security/ledger";
import * as db from "./supabase-sync";
import {
  INCENTIVE_LEVERS,
  type BudgetRemaining,
  type CommerceSession,
  type IncentiveLever,
  type LedgerEntry,
  type Listing,
  type MerchantId,
  type MerchantPolicy,
  type NexusOrder,
  type SecurityEvent,
} from "./types";

/**
 * Process-local store. Survives Next.js hot reloads via globalThis.
 * With Supabase configured (see supabase-sync.ts), sessions, orders and
 * webhook ids are also written to Supabase and read back after a restart;
 * listings, merchant policies and budgets stay in memory for this demo.
 */
interface MemoryState {
  sessions: Map<string, CommerceSession>;
  orders: Map<string, NexusOrder>;
  listings: Map<string, Listing>;
  paypalOrders: Map<string, string>;
  webhookEvents: Set<string>;
  policies: Map<MerchantId, MerchantPolicy>;
  ledger: LedgerEntry[];
  securityEvents?: SecurityEvent[];
}

const g = globalThis as unknown as { __nexusStore?: MemoryState };

function state(): MemoryState {
  if (!g.__nexusStore) {
    g.__nexusStore = {
      sessions: new Map(),
      orders: new Map(),
      listings: new Map(seedListings().map((l) => [l.id, l])),
      paypalOrders: new Map(),
      webhookEvents: new Set(),
      policies: new Map(Object.entries(structuredClone(SEED_POLICIES)) as Array<[MerchantId, MerchantPolicy]>),
      ledger: [],
      securityEvents: [],
    };
  }
  return g.__nexusStore;
}

const clone = <T>(v: T): T => structuredClone(v);

// ---------------------------------------------------------------- Supabase write-through
// Session updates come in bursts while agents negotiate, so they're batched
// (one write per session every 250 ms). Orders are written straight away,
// after their session, because the orders table points at it.

const pending = (globalThis as unknown as { __nexusPending?: Map<string, ReturnType<typeof setTimeout>> }).__nexusPending ?? new Map();
(globalThis as unknown as { __nexusPending?: typeof pending }).__nexusPending = pending;
const hydrated = globalThis as unknown as { __nexusHydrated?: { sessions?: boolean; orders?: boolean } };

/**
 * Shared mode, for serverless hosts like Vercel: many short-lived copies of
 * the app run side by side and any request can land on any of them, so
 * Supabase is the source of truth. Reads come fresh from Supabase and writes
 * are saved before the request finishes (no background timers).
 */
export const sharedStore = () => db.supabaseEnabled() && (Boolean(process.env.VERCEL) || process.env.NEXUS_SHARED_STORE === "1");

/**
 * Burst mode, for the live negotiation in shared mode: dozens of updates come
 * from one server in a few seconds. Re-reading Supabase before each one is
 * wasted time, so it re-reads at most every 3 seconds (still noticing a
 * restart from elsewhere), saves in the background (latest copy only), and
 * flushSession() waits for every save before the result is shown.
 */
interface Burst {
  lastRead: number;
  writing: Promise<unknown> | null;
  dirty: boolean;
}
const bursts = (globalThis as unknown as { __nexusBursts?: Map<string, Burst> }).__nexusBursts ?? new Map<string, Burst>();
(globalThis as unknown as { __nexusBursts?: Map<string, Burst> }).__nexusBursts = bursts;

/**
 * Shared mode list cache: lists of recent deals and orders are fetched once
 * and reused for a few seconds (pages, the notifications bell and the fraud
 * check all ask for them). Any save on this server clears it, and only as many
 * rows as asked for are fetched.
 */
const LIST_TTL_MS = 5000;
const lists = (globalThis as unknown as { __nexusLists?: { sessions?: { at: number; limit: number }; orders?: { at: number; limit: number } } }).__nexusLists ?? {};
(globalThis as unknown as { __nexusLists?: typeof lists }).__nexusLists = lists;
const listFresh = (k: "sessions" | "orders", limit: number) => {
  const c = lists[k];
  return Boolean(c && Date.now() - c.at < LIST_TTL_MS && c.limit >= Math.min(limit, 100));
};
const dropListCache = () => {
  lists.sessions = undefined;
  lists.orders = undefined;
};

function kickBurstWrite(id: string) {
  const b = bursts.get(id);
  if (!b || b.writing || !b.dirty) return;
  const s = state().sessions.get(id);
  b.dirty = false;
  if (!s) return;
  b.writing = db.upsertSession(clone(s)).finally(() => {
    b.writing = null;
    kickBurstWrite(id);
  });
}

function scheduleSessionWrite(id: string) {
  if (!db.supabaseEnabled()) return;
  clearTimeout(pending.get(id));
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      const s = state().sessions.get(id);
      if (s) void db.upsertSession(s);
    }, 250),
  );
}

async function flushSessionWrite(id: string) {
  if (!db.supabaseEnabled()) return;
  if (pending.has(id)) {
    clearTimeout(pending.get(id));
    pending.delete(id);
  }
  const s = state().sessions.get(id);
  if (s) await db.upsertSession(s);
}

export const store = {
  /** Start a burst of updates to one session from this server (the live negotiation). No-op outside shared mode. */
  beginBurst(id: string): void {
    if (sharedStore()) bursts.set(id, { lastRead: Date.now(), writing: null, dirty: false });
  },
  /** Wait until every update to this session is saved to Supabase. */
  async flushSession(id: string): Promise<void> {
    const b = bursts.get(id);
    while (b && (b.writing || b.dirty)) {
      if (b.writing) await b.writing;
      else kickBurstWrite(id);
    }
  },
  /** End the burst: everything is saved before this returns. */
  async endBurst(id: string): Promise<void> {
    await this.flushSession(id);
    bursts.delete(id);
    dropListCache();
  },
  async getSession(id: string): Promise<CommerceSession | null> {
    if (sharedStore()) {
      const fresh = await db.fetchSession<CommerceSession>(id);
      if (fresh) state().sessions.set(id, clone(fresh));
    }
    let s = state().sessions.get(id);
    // After a restart, read it back from Supabase.
    if (!s && db.supabaseEnabled()) {
      const saved = await db.fetchSession<CommerceSession>(id);
      if (saved && !state().sessions.has(id)) state().sessions.set(id, clone(saved));
      s = state().sessions.get(id);
    }
    return s ? clone(s) : null;
  },
  async saveSession(session: CommerceSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    state().sessions.set(session.id, clone(session));
    dropListCache();
    if (sharedStore()) await db.upsertSession(state().sessions.get(session.id)!);
    else scheduleSessionWrite(session.id);
  },
  /** Read-modify-write against the latest copy, so concurrent writers don't clobber each other. */
  async updateSession(id: string, mutate: (s: CommerceSession) => void): Promise<CommerceSession> {
    const burst = sharedStore() ? bursts.get(id) : undefined;
    if (burst && Date.now() - burst.lastRead < 3000 && state().sessions.has(id)) {
      // Burst: this server is the one writing; skip the re-read.
    } else if (sharedStore() || !state().sessions.has(id)) {
      await this.getSession(id); // the latest copy, from Supabase
      if (burst) burst.lastRead = Date.now();
    }
    const current = state().sessions.get(id);
    if (!current) throw new Error(`Session ${id} not found`);
    const next = clone(current);
    mutate(next);
    next.updatedAt = new Date().toISOString();
    state().sessions.set(id, clone(next));
    if (!burst) dropListCache();
    if (burst) {
      burst.dirty = true;
      kickBurstWrite(id);
    } else if (sharedStore()) await db.upsertSession(next);
    else scheduleSessionWrite(id);
    return next;
  },
  async listSessions(limit = 20): Promise<CommerceSession[]> {
    if (db.supabaseEnabled() && (sharedStore() ? !listFresh("sessions", limit) : !hydrated.__nexusHydrated?.sessions)) {
      hydrated.__nexusHydrated = { ...hydrated.__nexusHydrated, sessions: true };
      const n = sharedStore() ? Math.min(100, Math.max(limit, 20)) : 100;
      for (const s of await db.fetchRecentSessions<CommerceSession>(n)) if (sharedStore() || !state().sessions.has(s.id)) state().sessions.set(s.id, clone(s));
      if (sharedStore()) lists.sessions = { at: Date.now(), limit: n };
    }
    return [...state().sessions.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  },

  async listListings(): Promise<Listing[]> {
    return [...state().listings.values()].map(clone);
  },
  async getListing(id: string): Promise<Listing | null> {
    const l = state().listings.get(id);
    return l ? clone(l) : null;
  },
  /** Atomically decrement stock; false if not enough remains. */
  async reserveStock(listingId: string, quantity: number): Promise<boolean> {
    const l = state().listings.get(listingId);
    if (!l || l.stock < quantity) return false;
    l.stock -= quantity;
    return true;
  },
  async releaseStock(listingId: string, quantity: number): Promise<void> {
    const l = state().listings.get(listingId);
    if (l) l.stock += quantity;
  },

  async getOrder(id: string): Promise<NexusOrder | null> {
    if (sharedStore()) {
      const fresh = await db.fetchOrder<NexusOrder>(id);
      if (fresh) remember(fresh);
    }
    let o = state().orders.get(id);
    if (!o && db.supabaseEnabled()) {
      const saved = await db.fetchOrder<NexusOrder>(id);
      if (saved && !state().orders.has(id)) remember(saved);
      o = state().orders.get(id);
    }
    return o ? clone(o) : null;
  },
  async saveOrder(order: NexusOrder): Promise<void> {
    order.updatedAt = new Date().toISOString();
    remember(order);
    dropListCache();
    // Orders matter most: written straight away, after the session they belong to.
    if (db.supabaseEnabled()) {
      await flushSessionWrite(order.sessionId);
      await db.upsertOrder(order);
    }
  },
  async updateOrder(id: string, mutate: (o: NexusOrder) => void): Promise<NexusOrder> {
    if (sharedStore() || !state().orders.has(id)) await this.getOrder(id);
    const current = state().orders.get(id);
    if (!current) throw new Error(`Order ${id} not found`);
    const next = clone(current);
    mutate(next);
    await this.saveOrder(next);
    return clone(next);
  },
  async listOrders(limit = 50): Promise<NexusOrder[]> {
    if (db.supabaseEnabled() && (sharedStore() ? !listFresh("orders", limit) : !hydrated.__nexusHydrated?.orders)) {
      hydrated.__nexusHydrated = { ...hydrated.__nexusHydrated, orders: true };
      const n = sharedStore() ? Math.min(100, Math.max(limit, 20)) : 100;
      for (const o of await db.fetchRecentOrders<NexusOrder>(n)) if (sharedStore() || !state().orders.has(o.id)) remember(o);
      if (sharedStore()) lists.orders = { at: Date.now(), limit: n };
    }
    return [...state().orders.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  },
  async findOrderByCaptureId(captureId: string): Promise<NexusOrder | null> {
    const o = [...state().orders.values()].find((x) => x.payment?.captureId === captureId);
    if (o && !sharedStore()) return clone(o);
    // Refund and dispute webhooks may land on a server that never saw the order.
    if (db.supabaseEnabled()) {
      const saved = await db.fetchOrderByCaptureId<NexusOrder>(captureId);
      if (saved) {
        remember(saved);
        return clone(saved);
      }
    }
    return o ? clone(o) : null;
  },
  async findOrderByPayPalId(paypalOrderId: string): Promise<NexusOrder | null> {
    let id = state().paypalOrders.get(paypalOrderId);
    if (!id && db.supabaseEnabled()) {
      const saved = await db.fetchOrderByPayPalId<NexusOrder>(paypalOrderId);
      if (saved) {
        if (!state().orders.has(saved.id)) remember(saved);
        id = saved.id;
      }
    }
    return id ? this.getOrder(id) : null;
  },
  /** Returns false if this webhook event id was already processed. With Supabase, the database decides (across restarts and servers). */
  async markWebhookEvent(eventId: string): Promise<boolean> {
    const set = state().webhookEvents;
    if (set.has(eventId)) return false;
    const fresh = db.supabaseEnabled() ? await db.recordWebhookEvent(eventId) : null;
    set.add(eventId);
    return fresh ?? true;
  },

  // ---- merchant commercials (server-only; never returned by customer routes)
  async getPolicy(merchantId: MerchantId): Promise<MerchantPolicy> {
    // Settings saved before a field existed fall back to the seed default for it.
    return clone({ ...SEED_POLICIES[merchantId], ...state().policies.get(merchantId)! });
  },
  async savePolicy(merchantId: MerchantId, policy: MerchantPolicy): Promise<void> {
    const { remaining: _ignored, ...rest } = policy;
    void _ignored;
    state().policies.set(merchantId, clone(rest));
  },
  async saveListing(listing: Listing): Promise<void> {
    state().listings.set(listing.id, clone(listing));
  },
  async appendLedger(entry: LedgerEntry): Promise<void> {
    state().ledger.push(clone(entry));
  },
  async ledger(merchantId?: MerchantId): Promise<LedgerEntry[]> {
    return state()
      .ledger.filter((e) => !merchantId || e.merchantId === merchantId)
      .map(clone);
  },
  /** Remaining concession and incentive budget after open reservations. */
  async remainingBudget(merchantId: MerchantId): Promise<BudgetRemaining> {
    const policy = state().policies.get(merchantId)!;
    const used = { concession: 0, incentive: { warranty: 0, express: 0, shipping: 0, bundle: 0 } as Record<IncentiveLever, number> };
    for (const e of state().ledger) {
      if (e.merchantId !== merchantId || e.type === "commit") continue;
      const sign = e.type === "reserve" ? 1 : -1;
      used.concession += sign * e.concessionCents;
      for (const l of INCENTIVE_LEVERS) used.incentive[l] += sign * e.incentiveCents[l];
    }
    const incentiveCents = {} as Record<IncentiveLever, number>;
    for (const l of INCENTIVE_LEVERS) incentiveCents[l] = Math.round(policy.campaignBudgetCents * policy.incentiveAllocation[l]) - used.incentive[l];
    return { concessionCents: policy.concessionBudgetCents - used.concession, incentiveCents };
  },

  /** Test helper: reset everything to seed state. */
  /** Security events go to the persistent, hash-chained ledger, not process memory. */
  async addSecurityEvent(event: SecurityEvent): Promise<void> {
    appendRecord("security-event", { ...event } as unknown as Record<string, unknown>, event.at);
  },
  async listSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
    return readLedger<SecurityEvent>("security-event", limit).map((r) => r.data);
  },
  async reset(): Promise<void> {
    g.__nexusStore = undefined;
    hydrated.__nexusHydrated = undefined;
  },
};

/** Keeps an order (and its PayPal id lookup) in memory. */
function remember(order: NexusOrder) {
  state().orders.set(order.id, clone(order));
  if (order.payment?.paypalOrderId) state().paypalOrders.set(order.payment.paypalOrderId, order.id);
}
