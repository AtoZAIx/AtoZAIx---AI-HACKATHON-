import { ArrowRightIcon, PackageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { FilterTabs } from "@/components/nexus/common/filter-tabs";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { OrderStatusBadge, StatusBadge } from "@/components/nexus/common/status-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { store } from "@/lib/nexus/store";
import type { NexusOrder } from "@/lib/nexus/types";
import { LocalTime } from "@/components/nexus/common/local-time";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: Record<string, (o: NexusOrder) => boolean> = {
  all: () => true,
  pending: (o) => ["awaiting_approval", "approved", "payment_pending", "payment_captured"].includes(o.status),
  confirmed: (o) => o.status === "confirmed",
  failed: (o) => o.status === "payment_failed",
  refunded: (o) => o.status === "refunded",
  disputed: (o) => o.status === "disputed",
};

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <Page>
      <PageHeader title="Orders" description="Deals you chose. Approve and pay the ones waiting for you, and track the rest." />
      <Suspense fallback={<LoadingState rows={5} />}>
        <List searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

function verification(o: NexusOrder) {
  const r = o.payment?.verification;
  if (!r) return null;
  if (r.ok) return <StatusBadge tone="success" label="Payment checked" />;
  return r.checks.some((c) => c.essential && c.status === "fail") ? <StatusBadge tone="error" label="Payment check failed" /> : <StatusBadge tone="warning" label="Checking payment" />;
}

async function List({ searchParams }: Pick<PageProps<"/orders">, "searchParams">) {
  await connection();
  const q = await searchParams;
  const active = typeof q.status === "string" && q.status in FILTERS ? q.status : "all";
  const orders = await store.listOrders(500);
  const rows = orders.filter(FILTERS[active]);
  const count = (id: string) => orders.filter(FILTERS[id]).length;
  return (
    <div className="space-y-4">
      <FilterTabs
        base="/orders"
        active={active}
        options={[
          { id: "all", label: "All", count: count("all") },
          { id: "pending", label: "Pending", count: count("pending") },
          { id: "confirmed", label: "Confirmed", count: count("confirmed") },
          { id: "failed", label: "Failed", count: count("failed") },
          { id: "refunded", label: "Refunded", count: count("refunded") },
          { id: "disputed", label: "Disputed", count: count("disputed") },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={PackageIcon} title={active === "all" ? "No orders yet" : "No orders match this filter"} description="Orders appear once you select and verify a deal." />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {rows.map((o) => {
            const p = getProduct(o.terms.productId);
            return (
              <li key={o.id} className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center" data-order={o.id}>
                <ProductTile product={p} className="size-14 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {MERCHANT_DIRECTORY[o.merchantId].name} · <LocalTime iso={o.createdAt} mode="date" /> · <span className="font-mono">{o.id}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <OrderStatusBadge status={o.status} />
                    {verification(o)}
                  </div>
                </div>
                <p className="tabular text-lg font-semibold">
                  {formatMoney(o.totalCents)} <span className="text-xs font-normal text-muted-foreground">{o.currency}</span>
                </p>
                <Link href={`/orders/${o.id}`} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-medium hover:bg-secondary">
                  {o.status === "awaiting_approval" ? "Approve & pay" : "View"} <ArrowRightIcon className="size-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
