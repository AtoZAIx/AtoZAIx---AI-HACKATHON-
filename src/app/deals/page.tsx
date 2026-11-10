import { HandshakeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AGENT_STYLE } from "@/components/nexus/agent-avatar";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { store } from "@/lib/nexus/store";
import { LocalTime } from "@/components/nexus/common/local-time";

export const metadata: Metadata = { title: "Deals" };

export default function DealsPage() {
  return (
    <Page>
      <PageHeader title="Deals" description="Final offers from each completed negotiation, ready to compare side by side." />
      <Suspense fallback={<LoadingState variant="cards" rows={4} />}>
        <List />
      </Suspense>
    </Page>
  );
}

async function List() {
  await connection();
  const sessions = (await store.listSessions(200)).filter((s) => s.result?.ranking.length);
  if (!sessions.length) return <EmptyState icon={HandshakeIcon} title="No deals yet" description="Run a negotiation from the dashboard to collect final offers." />;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {sessions.map((s) => {
        const top = s.result!.ranking.slice(0, 3);
        const agreed = s.agreement?.verification.ok;
        return (
          <Link key={s.id} href={`/deals/${s.id}`} className="surface block space-y-4 p-5 transition hover:shadow-raised">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.intent!.summary.split(" · ").slice(0, 2).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">
                  {s.result!.rounds} rounds · <LocalTime iso={s.result!.completedAt} mode="datetime" />
                </p>
              </div>
              {agreed ? <StatusBadge tone="success" label={`Agreed v${s.agreement!.version}`} /> : <StatusBadge tone="brand" label="Awaiting choice" />}
            </div>
            <ul className="space-y-2">
              {top.map((r, i) => {
                const o = s.offers.find((x) => x.id === r.offerId)!;
                const p = getProduct(o.terms!.productId);
                return (
                  <li key={r.offerId} className="flex items-center gap-3 text-sm">
                    <ProductTile product={p} className="size-9 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`size-1.5 rounded-full ${AGENT_STYLE[r.merchantId].dot}`} aria-hidden />
                        {MERCHANT_DIRECTORY[r.merchantId].name}
                        {i === 0 && " · recommended"}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{formatMoney(r.totalCents)}</span>
                  </li>
                );
              })}
            </ul>
          </Link>
        );
      })}
    </div>
  );
}
