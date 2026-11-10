import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page } from "@/components/nexus/common/page-header";
import { OrderWorkspace } from "@/components/nexus/order/order-workspace";
import { paymentConfig } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

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
  return <OrderWorkspace key={order.id} initial={order} payments={paymentConfig()} />;
}
