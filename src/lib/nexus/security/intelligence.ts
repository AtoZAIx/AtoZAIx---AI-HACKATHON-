import "server-only";
import { PRODUCTS } from "../catalog";
import { MERCHANT_DIRECTORY, MERCHANT_IDS } from "../directory";
import { store } from "../store";
import type { MerchantId, RiskSignal, SecurityEvent } from "../types";
import { readLedger, verifyLedger } from "./ledger";
import { screenUntrusted } from "./prompt-shield";
import { AGENTS, TRUST_LABEL, trustReport, type TrustEvent } from "./trust";

export interface RiskDecisionRecord {
  orderId: string;
  merchantId: MerchantId;
  totalCents: number;
  score: number;
  level: "low" | "medium" | "high";
  decision: "allow" | "confirm" | "block";
  signals: RiskSignal[];
  confirmed?: boolean;
}

/** Scans every catalogue description for instructions aimed at an AI (indirect injection). */
export function auditCatalog() {
  const flagged = PRODUCTS.map((p) => ({ id: p.id, name: p.name, result: screenUntrusted(`${p.name}. ${p.description}`) })).filter((x) => x.result.verdict !== "safe");
  return { scanned: PRODUCTS.length, flagged };
}

export interface TimelineItem {
  at: string;
  kind: string;
  severity: "low" | "medium" | "high";
  title: string;
  explanation: string;
  ref: string | null;
}

/** Everything the Security center shows, read from the ledger and stored orders. */
export async function securityIntelligence(now = Date.now()) {
  const integrity = verifyLedger();
  const agents = AGENTS.map((a) => ({ ...trustReport(a, now), name: a === "buyer" ? "Buyer Agent" : MERCHANT_DIRECTORY[a].name }));
  const decisions = readLedger<RiskDecisionRecord>("risk-decision", 1000);
  const events = readLedger<SecurityEvent>("security-event", 1000);
  const trustEvents = readLedger<TrustEvent>("trust-event", 2000);
  const orders = await store.listOrders(500);

  const distribution = { low: 0, medium: 0, high: 0 };
  for (const d of decisions) distribution[d.data.level]++;
  const blocked = decisions.filter((d) => d.data.decision === "block").slice(0, 15).map((d) => ({ at: d.at, ...d.data }));

  const merchants = MERCHANT_IDS.map((id) => {
    const paid = orders.filter((o) => o.merchantId === id && o.payment?.capturedAt);
    const troubled = paid.filter((o) => o.status === "refunded" || o.status === "disputed").length;
    const t = trustReport(id, now);
    return {
      id,
      name: MERCHANT_DIRECTORY[id].name,
      trust: t.score,
      level: t.level,
      paid: paid.length,
      disputeRate: paid.length ? troubled / paid.length : null,
      guardrailRejections: t.counts["guardrail-rejection"] ?? 0,
      priceInconsistencies: t.counts["price-inconsistency"] ?? 0,
      authFailures: t.counts["auth-failure"] ?? 0,
      hiddenInstructions: t.counts["indirect-injection"] ?? 0,
    };
  });

  const timeline: TimelineItem[] = [
    ...events.map((e) => ({ at: e.at, kind: e.data.kind, severity: e.data.severity, title: e.data.title, explanation: e.data.detail, ref: e.data.ref })),
    ...decisions.map((d) => ({
      at: d.at,
      kind: "risk-decision",
      severity: (d.data.level === "high" ? "high" : d.data.level === "medium" ? "medium" : "low") as TimelineItem["severity"],
      title: `Fraud check: ${d.data.decision === "block" ? "blocked" : d.data.decision === "confirm" ? (d.data.confirmed ? "confirmed by shopper" : "asked to confirm") : "allowed"} (${d.data.score}/100)`,
      explanation: d.data.signals.length ? d.data.signals.map((s) => `+${s.points} ${s.label}${s.source === "statistical" ? " [statistical]" : ""}: ${s.detail}`).join(" ") : "No warning signs.",
      ref: d.data.orderId,
    })),
    ...trustEvents.map((t) => ({
      at: t.at,
      kind: "trust-event",
      severity: (t.data.weight >= 20 ? "high" : t.data.weight >= 10 ? "medium" : "low") as TimelineItem["severity"],
      title: `${t.data.agent === "buyer" ? "Buyer Agent" : MERCHANT_DIRECTORY[t.data.agent].name}: ${TRUST_LABEL[t.data.kind]} (−${t.data.weight} trust)`,
      explanation: t.data.detail,
      ref: t.data.ref,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);

  const since = now - 24 * 3600_000;
  const recent = events.filter((e) => Date.parse(e.at) >= since);
  return {
    integrity,
    agents,
    merchants,
    distribution,
    decisionsCount: decisions.length,
    blocked,
    injections: events.filter((e) => e.data.kind === "prompt-injection" || e.data.kind === "indirect-injection").slice(0, 10).map((e) => ({ ...e.data, at: e.at })),
    counts: {
      promptBlocked: recent.filter((e) => (e.data.kind === "prompt-injection" || e.data.kind === "indirect-injection") && e.data.severity === "high").length,
      confirm: recent.filter((e) => e.data.kind === "fraud-confirm").length,
      blocked: recent.filter((e) => e.data.kind === "fraud-block" || e.data.kind === "card-testing").length,
      webhooks: recent.filter((e) => e.data.kind === "webhook-forgery" || e.data.kind === "webhook-replay").length,
    },
    catalog: auditCatalog(),
    timeline,
  };
}
