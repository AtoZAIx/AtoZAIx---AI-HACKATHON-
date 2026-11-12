import { BadgeCheckIcon, CreditCardIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { JourneySteps } from "@/components/nexus/common/journey-steps";
import { journeyStep } from "@/lib/nexus/journey";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { DealVerification } from "@/components/nexus/verification/deal-verification";
import { MutualAgreementCard } from "@/components/nexus/verification/mutual-agreement-card";
import { Button } from "@/components/ui/button";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Deal verification" };

export default function VerificationDetail({ params }: PageProps<"/verification/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<LoadingState variant="panel" className="h-[70vh]" />}>
        <Loader params={params} />
      </Suspense>
    </Page>
  );
}

async function Loader({ params }: Pick<PageProps<"/verification/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const session = await store.getSession(id);
  if (!session) notFound();
  const order = session.orderId ? await store.getOrder(session.orderId) : null;
  const a = session.agreement;
  return (
    <>
      <JourneySteps current={journeyStep(session, order)} />
      <PageHeader
        title="Safety checks"
        description="Before any order is created, AtoZAIx automatically checks the deal: the right product, a real price, stock, delivery, warranty, returns and your budget. Green means passed, red means failed, amber means we couldn’t confirm it."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/negotiations/${session.id}`}>Back to the offers</Link>
            </Button>
            {order?.payment && (
              <Button asChild variant="outline">
                <Link href={`/payments/${order.id}`}>
                  <CreditCardIcon /> Payment check
                </Link>
              </Button>
            )}
          </>
        }
      />
      {a ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DealVerification report={a.verification} />
          <div className="xl:sticky xl:top-24 xl:self-start">
            <MutualAgreementCard agreement={a} order={order} />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={BadgeCheckIcon}
          title="Nothing verified yet"
          description="Select a deal in the negotiation room and the verification engine runs before any order exists."
          action={
            <Button asChild>
              <Link href={`/negotiations/${session.id}`}>Open negotiation room</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
