import { CreditCardIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { PAYMENT_STATE, StatusBadge } from "@/components/nexus/common/status-badge";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return (
    <Page>
      <PageHeader title="Payments" description="PayPal payments created for your approved orders, with their verified lifecycle state." />
      <Suspense fallback={<LoadingState rows={4} />}>
        <List />
      </Suspense>
    </Page>
  );
}

async function List() {
  await connection();
  const orders = (await store.listOrders(500)).filter((o) => o.payment);
  if (!orders.length) return <EmptyState icon={CreditCardIcon} title="No payments yet" description="A payment is created when you approve an order and continue to PayPal." />;
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-3 py-3 font-medium">PayPal order</th>
              <th className="px-3 py-3 font-medium">Capture</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((o) => {
              const p = o.payment!;
              const state = p.lifecycle.at(-1)?.state ?? "created";
              return (
                <tr key={o.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <Link href={`/payments/${o.id}`} className="font-medium hover:underline">
                      {getProduct(o.terms.productId).name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {MERCHANT_DIRECTORY[o.merchantId].name} · {p.provider === "simulated" ? "Simulator" : "PayPal Sandbox"}
                    </p>
                  </td>
                  <td className="px-3 font-mono text-xs">{p.paypalOrderId}</td>
                  <td className="px-3 font-mono text-xs">{p.captureId ?? "—"}</td>
                  <td className="tabular px-3 text-right font-medium">
                    {formatMoney(p.capturedAmountCents ?? o.totalCents)} {o.currency}
                  </td>
                  <td className="px-3">
                    <StatusBadge tone={PAYMENT_STATE[state].tone} label={PAYMENT_STATE[state].label} />
                  </td>
                  <td className="px-4">
                    {p.verification?.ok ? (
                      <StatusBadge tone="success" label="Verified" />
                    ) : p.verification ? (
                      p.verification.checks.some((c) => c.essential && c.status === "fail") ? (
                        <StatusBadge tone="error" label="Failed" />
                      ) : (
                        <StatusBadge tone="warning" label="Pending" />
                      )
                    ) : (
                      <StatusBadge tone="neutral" label="Not yet" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
