import { BarChart3Icon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarList, type BarDatum } from "@/components/nexus/bar-list";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { commerceAnalytics } from "@/lib/nexus/analytics";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY, MERCHANT_IDS } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";

export const metadata: Metadata = { title: "Commerce Analytics" };

const MERCHANT_COLOR = { atelier: "var(--agent-atelier)", bolt: "var(--agent-bolt)", cove: "var(--agent-cove)" } as const;

export default function AnalyticsPage() {
  return (
    <Page wide>
      <PageHeader title="Insights" description="How much your agent has saved you, and how your deals went. Counted from your real activity only." />
      <Suspense fallback={<LoadingState variant="cards" rows={6} />}>
        <Metrics />
      </Suspense>
    </Page>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);
function duration(ms: number | null) {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 120 ? `${s}s` : `${Math.round(s / 60)} min`;
}

async function Metrics() {
  await connection();
  const a = await commerceAnalytics();
  if (a.negotiations === 0) {
    return <EmptyState icon={BarChart3Icon} title="Not enough data yet" description="Complete a negotiation to start populating analytics. Metrics are never estimated." />;
  }
  const funnel: BarDatum[] = [
    { key: "neg", label: "Negotiations", value: a.negotiations, display: String(a.negotiations), detail: "Negotiations with final offers", color: "var(--chart-1)" },
    { key: "agr", label: "Agreements", value: a.agreements, display: String(a.agreements), detail: "Deals that passed verification", color: "var(--chart-1)" },
    { key: "apr", label: "Approved", value: a.approved, display: String(a.approved), detail: "Orders the customer approved", color: "var(--chart-1)" },
    { key: "cap", label: "Captured", value: a.captures, display: String(a.captures), detail: "Payments captured", color: "var(--chart-1)" },
    { key: "ver", label: "Verified", value: a.verifiedTransactions, display: String(a.verifiedTransactions), detail: "Payments that passed every essential check", color: "var(--chart-1)" },
  ];
  const wins: BarDatum[] = MERCHANT_IDS.map((id) => ({
    key: id,
    label: MERCHANT_DIRECTORY[id].name,
    value: a.wins[id] ?? 0,
    display: String(a.wins[id] ?? 0),
    detail: `${a.wins[id] ?? 0} verified agreement${(a.wins[id] ?? 0) === 1 ? "" : "s"}`,
    color: MERCHANT_COLOR[id],
  }));
  const savings: BarDatum[] = a.savingsByOrder.map((o) => ({
    key: o.id,
    label: getProduct(o.productId).name,
    value: o.savingsCents,
    display: formatMoney(o.savingsCents),
    detail: `${formatMoney(o.savingsCents)} saved on ${formatMoney(o.totalCents)} · ${MERCHANT_DIRECTORY[o.merchantId].name}`,
    color: "var(--chart-1)",
  }));

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total negotiations" value={String(a.negotiations)} />
        <Tile label="Completed agreements" value={String(a.agreements)} />
        <Tile label="Negotiation success rate" value={pct(a.successRate)} sub="Agreements ÷ negotiations" />
        <Tile label="Average time to agreement" value={duration(a.avgTimeToAgreementMs)} sub="From request to signed terms" />
        <Tile label="Offer acceptance rate" value={pct(a.offerAcceptanceRate)} sub={`Accepted ÷ ${a.presented} final offers presented`} />
        <Tile label="Verified transactions" value={String(a.verifiedTransactions)} />
        <Tile label="Successful PayPal captures" value={String(a.captures)} />
        <Tile label="Actual customer savings" value={formatMoney(a.savingsCents)} sub="On confirmed orders, vs merchant list" />
      </dl>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Conversion funnel" subtitle="Each step counted from stored records">
          <BarList data={funnel} ariaLabel="Conversion funnel" />
        </Panel>
        <Panel title="Agreements by merchant" subtitle="Verified agreements">
          <BarList data={wins} ariaLabel="Agreements by merchant" />
        </Panel>
        <Panel title="Savings per confirmed order" subtitle="vs merchant list price">
          {savings.length ? <BarList data={savings} ariaLabel="Savings per confirmed order" /> : <p className="text-sm text-muted-foreground">No confirmed orders yet.</p>}
        </Panel>
      </div>
      <p className="text-xs text-muted-foreground">Merchant counter acceptance rate: {pct(a.counterAcceptanceRate)} of buyer counteroffers met exactly.</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold">{value}</dd>
      {sub && <dd className="text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
