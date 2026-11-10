import { HandshakeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { DealComparison } from "@/components/nexus/deals/deal-comparison";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { Button } from "@/components/ui/button";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Deal comparison" };

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <Page wide>
      <Suspense fallback={<LoadingState variant="panel" className="h-[70vh]" />}>
        <Loader params={params} />
      </Suspense>
    </Page>
  );
}

async function Loader({ params }: Pick<PageProps<"/deals/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const session = await store.getSession(id);
  if (!session) notFound();
  const order = session.orderId ? await store.getOrder(session.orderId) : null;
  return (
    <>
      <PageHeader
        eyebrow="Deal comparison"
        title={session.intent?.summary.split(" · ").slice(0, 2).join(" · ") ?? "Deal comparison"}
        description={session.intent?.summary}
        actions={
          <Button asChild variant="outline">
            <Link href={`/negotiations/${session.id}`}>Open negotiation room</Link>
          </Button>
        }
      />
      {session.result?.ranking.length ? (
        <>
          <div className="surface flex gap-3 p-4">
            <AgentAvatar id="buyer" />
            <div>
              <p className="text-xs font-semibold">Buyer agent recommendation</p>
              <p className="text-sm text-muted-foreground">{session.result.recommendation}</p>
            </div>
          </div>
          <DealComparison key={session.id} initial={session} initialOrder={order} />
        </>
      ) : (
        <EmptyState icon={HandshakeIcon} title="No final offers yet" description="Offers appear here once the negotiation completes." />
      )}
    </>
  );
}
