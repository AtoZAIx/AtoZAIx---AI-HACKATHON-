import { FlaskConicalIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { WalletEligibility } from "@/components/nexus/wallet/wallet-eligibility";
import { paymentConfig } from "@/lib/nexus/service";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <Page>
      <PageHeader title="Wallet" description="Eligible PayPal checkout options for your purchases. AtoZAIx never sees or stores your payment credentials." />
      <Suspense fallback={<LoadingState variant="panel" />}>
        <Wallet />
      </Suspense>
    </Page>
  );
}

async function Wallet() {
  await connection();
  const p = paymentConfig();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="surface space-y-4 p-5">
        <h2 className="text-sm font-semibold">Eligible checkout options</h2>
        {p.provider === "paypal-sandbox" && p.clientId ? (
          <WalletEligibility clientId={p.clientId} />
        ) : (
          <EmptyState
            compact
            icon={FlaskConicalIcon}
            title="PayPal Sandbox isn’t connected"
            description="Checkout is running on the AtoZAIx payment simulator, so there are no real wallet methods to show. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to check eligibility with PayPal."
          />
        )}
      </section>
      <aside className="space-y-4">
        <div className="surface space-y-3 p-5 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheckIcon className="size-4 text-success" /> How payment works
          </div>
          <ul className="space-y-2 text-muted-foreground">
            <li>You approve the exact amount before any payment exists.</li>
            <li>You authenticate with PayPal directly; AtoZAIx only receives an order reference.</li>
            <li>AtoZAIx captures server-side and re-reads the result from PayPal before confirming.</li>
            <li>Settlement currency: USD.</li>
          </ul>
        </div>
        <div className="surface flex items-center gap-3 p-5 text-sm">
          <WalletIcon className="size-5 text-muted-foreground" />
          <span>Mode: {p.provider === "paypal-sandbox" ? "PayPal Sandbox" : "Simulator (no money moves)"}</span>
        </div>
      </aside>
    </div>
  );
}
