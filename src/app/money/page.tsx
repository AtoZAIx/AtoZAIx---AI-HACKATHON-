import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { MoneyPlanner, type GoalProduct } from "@/components/nexus/money/money-planner";
import type { Purchase } from "@/lib/nexus/budget";
import { getProduct, PRODUCTS } from "@/lib/nexus/catalog";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = {
  title: "Money plan",
  description: "Split your monthly pay between bills, savings goals and spending, and track the month.",
};

export default function MoneyPage() {
  return (
    <Page>
      <PageHeader
        title="Money plan"
        description="Your personal plan: how much to spend on each thing, and what to save."
      />
      <Suspense fallback={<LoadingState variant="cards" rows={4} />}>
        <PlannerWithData />
      </Suspense>
    </Page>
  );
}

/** Real purchases and current store prices; the plan itself stays in the browser. */
async function PlannerWithData() {
  await connection();
  const [orders, listings] = await Promise.all([store.listOrders(500), store.listListings()]);
  const purchases: Purchase[] = orders
    .filter((o) => o.status === "confirmed" && o.payment?.capturedAt)
    .map((o) => ({
      orderId: o.id,
      productId: o.terms.productId,
      productName: getProduct(o.terms.productId).name,
      totalCents: o.payment!.capturedAmountCents ?? o.totalCents,
      paidAt: o.payment!.capturedAt!,
    }));
  const lowest = new Map<string, number>();
  for (const l of listings) {
    if (l.stock <= 0) continue;
    const total = l.listPriceCents + l.shippingCents;
    lowest.set(l.productId, Math.min(lowest.get(l.productId) ?? Infinity, total));
  }
  const products: GoalProduct[] = PRODUCTS.filter((p) => lowest.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, fromCents: lowest.get(p.id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <MoneyPlanner purchases={purchases} products={products} />;
}
