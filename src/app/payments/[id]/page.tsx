import { CreditCardIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { PaymentVerification } from "@/components/nexus/payments/payment-verification";
import { Button } from "@/components/ui/button";
import { paymentConfig } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Payment verification" };

export default function PaymentPage({ params }: PageProps<"/payments/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<LoadingState variant="panel" className="h-[70vh]" />}>
        <Loader params={params} />
      </Suspense>
    </Page>
  );
}

async function Loader({ params }: Pick<PageProps<"/payments/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const order = await store.getOrder(id);
  if (!order) notFound();
  return (
    <>
      <PageHeader
        title="Payment check"
        description="After you pay, Nexus asks PayPal directly what was paid, to whom and how much, and only then confirms your order."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orders/${order.id}`}>Order details</Link>
          </Button>
        }
      />
      {order.payment ? (
        <PaymentVerification initial={order} simulator={paymentConfig().provider === "simulated"} />
      ) : (
        <EmptyState icon={CreditCardIcon} title="No payment yet" description="Approve the order and continue to PayPal to create a payment." />
      )}
    </>
  );
}
