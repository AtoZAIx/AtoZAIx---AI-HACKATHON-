import { BadgeCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import { summarize } from "@/components/nexus/verification/deal-verification";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { store } from "@/lib/nexus/store";
import { LocalTime } from "@/components/nexus/common/local-time";

export const metadata: Metadata = { title: "Verification" };

export default function VerificationPage() {
  return (
    <Page>
      <PageHeader title="Verification" description="Deal verifications run before an order exists; payment verifications run after PayPal capture." />
      <Suspense fallback={<LoadingState rows={4} />}>
        <Lists />
      </Suspense>
    </Page>
  );
}

async function Lists() {
  await connection();
  const [sessions, orders] = await Promise.all([store.listSessions(200), store.listOrders(200)]);
  const deals = sessions.filter((s) => s.agreement);
  const payments = orders.filter((o) => o.payment?.verification);
  return (
    <div className="space-y-8">
      <Section title="Deal verifications" description={`${deals.length} agreement${deals.length === 1 ? "" : "s"} checked`}>
        {deals.length === 0 ? (
          <EmptyState compact icon={BadgeCheckIcon} title="No deals verified yet" description="Select a deal in a negotiation to run the verification engine." />
        ) : (
          <ul className="surface divide-y overflow-hidden">
            {deals.map((s) => {
              const a = s.agreement!;
              const sum = summarize(a.verification);
              return (
                <li key={s.id}>
                  <Link href={`/verification/${s.id}`} className="flex flex-col gap-2 px-4 py-3.5 hover:bg-secondary/60 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{getProduct(a.terms.productId).name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {MERCHANT_DIRECTORY[a.merchantId].name} · v{a.version} · <LocalTime iso={a.verification.checkedAt} mode="datetime" />
                      </span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {sum.passed} passed · {sum.failed} failed · {sum.unknown} unknown
                    </span>
                    <span className="tabular text-sm font-semibold">{formatMoney(a.totalCents)}</span>
                    {a.verification.ok ? <StatusBadge tone="success" label="Verified" /> : <StatusBadge tone="error" label="Blocked" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title="Payment verifications" description="Re-read from the payment provider after capture">
        {payments.length === 0 ? (
          <EmptyState compact icon={BadgeCheckIcon} title="No payments verified yet" description="Payment checks run after PayPal capture." />
        ) : (
          <ul className="surface divide-y overflow-hidden">
            {payments.map((o) => {
              const r = o.payment!.verification!;
              const sum = summarize(r);
              return (
                <li key={o.id}>
                  <Link href={`/payments/${o.id}`} className="flex flex-col gap-2 px-4 py-3.5 hover:bg-secondary/60 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{getProduct(o.terms.productId).name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{o.payment!.paypalOrderId}</span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {sum.passed} passed · {sum.failed} failed · {sum.unknown} unknown
                    </span>
                    {r.ok ? <StatusBadge tone="success" label="Verified" /> : sum.failed ? <StatusBadge tone="error" label="Failed" /> : <StatusBadge tone="warning" label="Pending" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
