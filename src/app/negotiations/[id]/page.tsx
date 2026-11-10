import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page } from "@/components/nexus/common/page-header";
import { NegotiationRoom } from "@/components/nexus/negotiation/negotiation-room";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Your deal" };

export default function NegotiationPage({ params, searchParams }: PageProps<"/negotiations/[id]">) {
  return (
    <Page wide className="space-y-4">
      <Suspense fallback={<LoadingState variant="room" />}>
        <RoomLoader params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function RoomLoader({ params, searchParams }: Pick<PageProps<"/negotiations/[id]">, "params" | "searchParams">) {
  await connection();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const session = await store.getSession(id);
  if (!session) notFound();
  const order = session.orderId ? await store.getOrder(session.orderId) : null;
  return <NegotiationRoom key={session.id} initial={session} initialOrder={order} autostart={q.go === "1"} />;
}
