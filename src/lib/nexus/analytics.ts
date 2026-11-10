import "server-only";
import { store } from "./store";
import type { MerchantId } from "./types";

/** Commerce analytics computed only from persisted sessions and orders. */
export async function commerceAnalytics() {
  const [sessions, orders] = await Promise.all([store.listSessions(1000), store.listOrders(1000)]);
  const negotiated = sessions.filter((s) => s.result?.ranking.length);
  const agreed = sessions.filter((s) => s.agreement?.verification.ok);
  const presented = negotiated.reduce((n, s) => n + s.result!.ranking.length, 0);
  const counters = sessions.reduce((n, s) => n + s.counters.length, 0);
  const metCounters = sessions.reduce((n, s) => n + s.offers.filter((o) => o.acceptsCounterId).length, 0);
  const times = agreed.map((s) => new Date(s.agreement!.agreedAt).getTime() - new Date(s.createdAt).getTime()).filter((t) => t >= 0);
  const approved = orders.filter((o) => o.approval);
  const captured = orders.filter((o) => o.payment?.lifecycle.some((e) => e.state === "captured"));
  const verified = orders.filter((o) => o.payment?.verification?.ok);
  const confirmed = orders.filter((o) => o.status === "confirmed");
  const wins = {} as Record<MerchantId, number>;
  for (const s of agreed) wins[s.agreement!.merchantId] = (wins[s.agreement!.merchantId] ?? 0) + 1;
  return {
    negotiations: negotiated.length,
    agreements: agreed.length,
    successRate: negotiated.length ? agreed.length / negotiated.length : null,
    avgTimeToAgreementMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    offerAcceptanceRate: presented ? agreed.length / presented : null,
    counterAcceptanceRate: counters ? metCounters / counters : null,
    presented,
    approved: approved.length,
    captures: captured.length,
    verifiedTransactions: verified.length,
    savingsCents: confirmed.reduce((s, o) => s + o.savingsCents, 0),
    savingsByOrder: confirmed.map((o) => ({ id: o.id, productId: o.terms.productId, merchantId: o.merchantId, savingsCents: o.savingsCents, totalCents: o.totalCents })),
    wins,
  };
}
