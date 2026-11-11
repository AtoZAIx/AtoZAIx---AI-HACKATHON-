import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page } from "@/components/nexus/common/page-header";
import { OrderWorkspace } from "@/components/nexus/order/order-workspace";
import { paymentConfig } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";
import { getProduct } from "@/lib/nexus/catalog";
import type { Purchase } from "@/lib/nexus/budget";

export const metadata: Metadata = { title: "Order" };

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<LoadingState variant="panel" className="h-[70vh]" />}>
        <OrderLoader params={params} />
      </Suspense>
    </Page>
  );
}

async function OrderLoader({ params }: Pick<PageProps<"/orders/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const order = await store.getOrder(id);
  if (!order) notFound();
  // Other purchases already paid (for Spend Guard's monthly ENJOY check).
  const purchases: Purchase[] = (await store.listOrders(500))
    .filter((o) => o.id !== order.id && o.status === "confirmed" && o.payment?.capturedAt)
    .map((o) => ({ orderId: o.id, productId: o.terms.productId, productName: getProduct(o.terms.productId).name, totalCents: o.payment!.capturedAmountCents ?? o.totalCents, paidAt: o.payment!.capturedAt! }));
  return <OrderWorkspace key={order.id} initial={order} payments={paymentConfig()} purchases={purchases} />;
}
