import "server-only";
import { seedListings } from "./inventory";
import { SEED_POLICIES } from "./merchants";
import { appendRecord, readLedger } from "./security/ledger";
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
 * The async surface mirrors a database adapter so a Supabase-backed
 * implementation can replace it without touching callers (see
 * supabase/migrations for the target schema).
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

export const store = {
  async getSession(id: string): Promise<CommerceSession | null> {
    const s = state().sessions.get(id);
    return s ? clone(s) : null;
  },
  async saveSession(session: CommerceSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    state().sessions.set(session.id, clone(session));
  },
  /** Read-modify-write against the latest copy, so concurrent writers don't clobber each other. */
  async updateSession(id: string, mutate: (s: CommerceSession) => void): Promise<CommerceSession> {
    const current = state().sessions.get(id);
    if (!current) throw new Error(`Session ${id} not found`);
    const next = clone(current);
    mutate(next);
    next.updatedAt = new Date().toISOString();
    state().sessions.set(id, clone(next));
    return next;
  },
  async listSessions(limit = 20): Promise<CommerceSession[]> {
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
    const o = state().orders.get(id);
    return o ? clone(o) : null;
  },
  async saveOrder(order: NexusOrder): Promise<void> {
    order.updatedAt = new Date().toISOString();
    state().orders.set(order.id, clone(order));
    if (order.payment?.paypalOrderId) state().paypalOrders.set(order.payment.paypalOrderId, order.id);
  },
  async updateOrder(id: string, mutate: (o: NexusOrder) => void): Promise<NexusOrder> {
    const current = state().orders.get(id);
    if (!current) throw new Error(`Order ${id} not found`);
    const next = clone(current);
    mutate(next);
    await this.saveOrder(next);
    return clone(next);
  },
  async listOrders(limit = 50): Promise<NexusOrder[]> {
    return [...state().orders.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  },
  async findOrderByCaptureId(captureId: string): Promise<NexusOrder | null> {
    const o = [...state().orders.values()].find((x) => x.payment?.captureId === captureId);
    return o ? clone(o) : null;
  },
  async findOrderByPayPalId(paypalOrderId: string): Promise<NexusOrder | null> {
    const id = state().paypalOrders.get(paypalOrderId);
    return id ? this.getOrder(id) : null;
  },
  /** Returns false if this webhook event id was already processed. */
  async markWebhookEvent(eventId: string): Promise<boolean> {
    const set = state().webhookEvents;
    if (set.has(eventId)) return false;
    set.add(eventId);
    return true;
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
  },
};
