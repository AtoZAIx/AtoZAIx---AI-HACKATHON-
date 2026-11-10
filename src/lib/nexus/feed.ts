import "server-only";
import { getProduct } from "./catalog";
import { MERCHANT_DIRECTORY } from "./directory";
import { formatMoney } from "./money";
import { store } from "./store";
import type { AgentId } from "./types";

export interface Notification {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string;
  tone: "action" | "success" | "info" | "error";
}

/** Notifications derived from real session and order state — nothing synthetic. */
export async function notifications(limit = 12): Promise<Notification[]> {
  const [sessions, orders] = await Promise.all([store.listSessions(50), store.listOrders(50)]);
  const out: Notification[] = [];
  for (const o of orders) {
    const name = getProduct(o.terms.productId).name;
    const merchant = MERCHANT_DIRECTORY[o.merchantId].name;
    if (o.status === "awaiting_approval")
      out.push({ id: `${o.id}-approve`, at: o.createdAt, title: "Approval needed", detail: `${name} · ${formatMoney(o.totalCents)} from ${merchant}`, href: `/orders/${o.id}`, tone: "action" });
    if (o.status === "confirmed")
      out.push({ id: `${o.id}-paid`, at: o.updatedAt, title: "Payment verified", detail: `${name} · ${formatMoney(o.totalCents)}`, href: `/payments/${o.id}`, tone: "success" });
    if (o.status === "payment_failed" || o.status === "disputed")
      out.push({ id: `${o.id}-fail`, at: o.updatedAt, title: o.status === "disputed" ? "Payment disputed" : "Payment failed", detail: name, href: `/payments/${o.id}`, tone: "error" });
    if (o.status === "refunded") out.push({ id: `${o.id}-refund`, at: o.updatedAt, title: "Payment refunded", detail: name, href: `/payments/${o.id}`, tone: "info" });
  }
  for (const s of sessions) {
    if (s.status === "negotiated" && s.result?.ranking.length)
      out.push({
        id: `${s.id}-offers`,
        at: s.result.completedAt,
        title: "Offers ready",
        detail: `${s.result.ranking.length} final offers · best ${formatMoney(s.result.ranking[0].totalCents)}`,
        href: `/negotiations/${s.id}`,
        tone: "info",
      });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export interface ActivityItem {
  id: string;
  at: string;
  agent: AgentId;
  text: string;
  href: string;
}

/** Latest real agent protocol messages across sessions. */
export async function agentActivity(limit = 12, agent?: AgentId): Promise<ActivityItem[]> {
  const sessions = await store.listSessions(50);
  return sessions
    .flatMap((s) => s.messages.filter((m) => !agent || m.from === agent).map((m) => ({ id: m.id, at: m.createdAt, agent: m.from, text: m.text, href: `/negotiations/${s.id}` })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export interface SearchHit {
  kind: "negotiation" | "order" | "product";
  title: string;
  detail: string;
  href: string;
}

export async function search(q: string): Promise<SearchHit[]> {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const [sessions, orders] = await Promise.all([store.listSessions(100), store.listOrders(100)]);
  const { PRODUCTS } = await import("./catalog");
  const hits: SearchHit[] = [];
  for (const s of sessions) {
    const text = `${s.intent?.summary ?? ""} ${s.chat.map((c) => c.text).join(" ")} ${s.id}`.toLowerCase();
    if (text.includes(query)) hits.push({ kind: "negotiation", title: s.intent?.summary.split(" · ").slice(0, 2).join(" · ") ?? s.chat[0]?.text ?? s.id, detail: s.status, href: `/negotiations/${s.id}` });
  }
  for (const o of orders) {
    const name = getProduct(o.terms.productId).name;
    if (`${name} ${o.id} ${MERCHANT_DIRECTORY[o.merchantId].name} ${o.payment?.paypalOrderId ?? ""}`.toLowerCase().includes(query))
      hits.push({ kind: "order", title: name, detail: `${o.id} · ${formatMoney(o.totalCents)} · ${o.status.replace(/_/g, " ")}`, href: `/orders/${o.id}` });
  }
  for (const p of PRODUCTS) {
    if (`${p.name} ${p.brand} ${p.category} ${p.suitedFor.join(" ")}`.toLowerCase().includes(query))
      hits.push({ kind: "product", title: p.name, detail: p.description, href: `/discover?q=${encodeURIComponent(p.name)}` });
  }
  return hits.slice(0, 20);
}

export interface AgentStats {
  id: AgentId;
  status: "negotiating" | "idle" | "paused";
  sessions: number;
  messages: number;
  offers: number;
  recommended: number;
  agreements: number;
  lastActiveAt: string | null;
}

/** Per-agent status and counts, computed from stored negotiations. */
export async function agentStats(): Promise<Record<AgentId, AgentStats>> {
  const sessions = await store.listSessions(500);
  const ids: AgentId[] = ["buyer", "coordinator", "atelier", "bolt", "cove"];
  const live = sessions.filter((s) => s.status === "negotiating" && Date.now() - new Date(s.updatedAt).getTime() < 120_000);
  const out = {} as Record<AgentId, AgentStats>;
  for (const id of ids) {
    const msgs = sessions.flatMap((s) => s.messages.filter((m) => m.from === id));
    const isMerchant = id !== "buyer" && id !== "coordinator";
    const paused = isMerchant ? !(await store.getPolicy(id)).active : false;
    out[id] = {
      id,
      status: paused ? "paused" : live.length ? "negotiating" : "idle",
      sessions: sessions.filter((s) => s.messages.some((m) => m.from === id)).length,
      messages: msgs.length,
      offers: isMerchant ? sessions.flatMap((s) => s.offers.filter((o) => o.merchantId === id && o.terms)).length : 0,
      recommended: isMerchant ? sessions.filter((s) => s.result?.ranking[0]?.merchantId === id).length : 0,
      agreements: isMerchant ? sessions.filter((s) => s.agreement?.verification.ok && s.agreement.merchantId === id).length : sessions.filter((s) => s.agreement?.verification.ok).length,
      lastActiveAt: msgs.map((m) => m.createdAt).sort().at(-1) ?? null,
    };
  }
  return out;
}
