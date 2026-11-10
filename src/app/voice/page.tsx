import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { VoiceInput } from "@/components/nexus/voice/voice-input";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Voice" };

export default function VoicePage({ searchParams }: PageProps<"/voice">) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-card">
      <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Preparing voice…</div>}>
        <VoiceLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function VoiceLoader({ searchParams }: Pick<PageProps<"/voice">, "searchParams">) {
  await connection();
  const q = await searchParams;
  const id = typeof q.session === "string" ? q.session : null;
  const session = id ? await store.getSession(id) : null;
  const order = session?.orderId ? await store.getOrder(session.orderId) : null;
  return <VoiceInput initialSession={session} initialOrder={order} />;
}
