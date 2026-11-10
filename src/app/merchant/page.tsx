import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page } from "@/components/nexus/common/page-header";
import { MerchantDashboard } from "@/components/nexus/merchant/merchant-dashboard";
import { MerchantSignIn } from "@/components/nexus/merchant/merchant-sign-in";
import { currentMerchant, DEV_PASSCODE, devPasscodeActive } from "@/lib/nexus/merchant-auth";
import { getWorkspace } from "@/lib/nexus/merchant-workspace";

export const metadata: Metadata = { title: "Merchant workspace", robots: { index: false } };

export default function MerchantPage() {
  return (
    <Page wide>
      <Suspense fallback={<LoadingState variant="panel" className="h-[60vh]" />}>
        <Gate />
      </Suspense>
    </Page>
  );
}

/** Server-side authorisation: confidential data is only fetched for a signed-in merchant. */
async function Gate() {
  await connection();
  const merchantId = await currentMerchant();
  if (!merchantId) {
    return (
      <div className="py-6 md:py-12">
        <MerchantSignIn devHint={devPasscodeActive() ? `Development mode: merchants without NEXUS_MERCHANT_PASSCODE_<ID> use the passcode “${DEV_PASSCODE}”. This fallback is disabled in production.` : null} />
      </div>
    );
  }
  return <MerchantDashboard initial={await getWorkspace(merchantId)} />;
}
