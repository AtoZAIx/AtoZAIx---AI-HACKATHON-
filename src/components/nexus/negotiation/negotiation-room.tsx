"use client";

import { ArrowRightIcon, BadgeCheckIcon, ChevronDownIcon, CircleAlertIcon, ColumnsIcon, MessageCircleIcon, MicIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatWindow } from "@/components/nexus/chat/chat-window";
import { JourneySteps } from "@/components/nexus/common/journey-steps";
import { Button } from "@/components/ui/button";
import { useNegotiation } from "@/hooks/use-negotiation";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { journeyStep } from "@/lib/nexus/journey";
import { formatMoney } from "@/lib/nexus/money";
import type { CommerceSession, NexusOrder } from "@/lib/nexus/types";
import { LiveProgress } from "./live-progress";
import { NegotiationTimeline } from "./negotiation-timeline";
import { RequestSummary } from "./request-summary";
import { SimpleOfferCard } from "./simple-offer-card";

/**
 * The deal page. Shows one thing at a time in plain words:
 * live progress → our pick and other offers → deal locked → approve & pay.
 * The full agent-by-agent log is one click away, not in the way.
 */
export function NegotiationRoom({ initial, initialOrder, autostart }: { initial: CommerceSession; initialOrder: NexusOrder | null; autostart: boolean }) {
  const router = useRouter();
  const n = useNegotiation(initial, initialOrder);
  const session = n.session!;
  const started = useRef(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!autostart || started.current) return;
    started.current = true;
    router.replace(`/negotiations/${initial.id}`, { scroll: false });
    void n.negotiate();
  }, [autostart, initial.id, n, router]);

  const send = async (text: string) => {
    const res = await n.send(text, "chat");
    if (res?.action.type === "negotiate") await n.negotiate();
  };

  const result = session.result;
  const agreement = session.agreement;
  const locked = Boolean(agreement?.verification.ok && n.order && n.order.status !== "cancelled");
  const failedCheck = agreement && !agreement.verification.ok;
  const running = n.streaming || session.status === "negotiating";
  const canStart = !running && Boolean(session.intent) && !result && session.status !== "ordered";
  const ranking = result?.ranking ?? [];
  const best = ranking[0];
  const step = journeyStep(session, n.order);
  const title = session.intent
    ? session.intent.targetProductId
      ? getProduct(session.intent.targetProductId).name
      : session.intent.summary.split(" · ")[0]
    : "New request";

  let headline: string;
  if (!session.intent) headline = "Tell your agent what you’re looking for.";
  else if (running) headline = "Your agent is getting the best price from 3 stores. This takes a few seconds.";
  else if (locked) headline = "Deal locked and safety-checked. Next: approve the price and pay.";
  else if (failedCheck) headline = "That deal didn’t pass our safety checks, so we stopped. Please pick another offer.";
  else if (result && ranking.length) headline = `Done! Your agent found ${ranking.length} offer${ranking.length === 1 ? "" : "s"}. Our pick is at the top.`;
  else if (result) headline = "No store could offer what you asked for. Try changing your request in the chat.";
  else headline = "Ready when you are. Press Start to ask the stores.";

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <JourneySteps current={step} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-[15px] text-muted-foreground" role="status">
            {headline}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStart && (
            <Button size="lg" onClick={() => void n.negotiate()}>
              <PlayIcon /> Start
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/voice?session=${session.id}`}>
              <MicIcon /> Speak instead
            </Link>
          </Button>
          {result && !running && session.status !== "ordered" && (
            <Button variant="ghost" onClick={() => void n.negotiate()}>
              <RotateCcwIcon /> Ask again
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {running && <LiveProgress session={session} phase={n.phase} />}

          {locked && agreement && n.order && (
            <section className="flex flex-col gap-4 rounded-2xl border border-success/30 bg-success-soft/60 p-5 sm:flex-row sm:items-center" aria-label="Deal locked">
              <BadgeCheckIcon className="size-9 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  You chose {getProduct(agreement.terms.productId).name} from {MERCHANT_DIRECTORY[agreement.merchantId].name}
                </p>
                <p className="text-sm text-muted-foreground">
                  All safety checks passed.{" "}
                  <Link href={`/verification/${session.id}`} className="underline">
                    See the checks
                  </Link>
                  . Nothing is charged until you approve.
                </p>
              </div>
              <Button asChild size="lg" data-testid="review-order">
                <Link href={`/orders/${n.order.id}`}>
                  Review & pay {formatMoney(n.order.totalCents)}{n.order.booking ? " token" : ""} <ArrowRightIcon />
                </Link>
              </Button>
            </section>
          )}

          {failedCheck && (
            <section className="flex gap-3 rounded-2xl border border-error/30 bg-error-soft/60 p-5 text-sm">
              <CircleAlertIcon className="size-6 shrink-0 text-error" />
              <div>
                <p className="font-medium">We didn’t create an order.</p>
                <p className="text-muted-foreground">
                  The offer failed a safety check (for example it expired or sold out).{" "}
                  <Link href={`/verification/${session.id}`} className="underline">
                    See why
                  </Link>{" "}
                  or press Ask again for fresh prices.
                </p>
              </div>
            </section>
          )}

          {!running && ranking.length > 0 && !locked && (
            <div className="space-y-3">
              {ranking.map((r, i) => {
                const offer = session.offers.find((o) => o.id === r.offerId)!;
                return (
                  <SimpleOfferCard
                    key={r.offerId}
                    session={session}
                    offer={offer}
                    ranked={r}
                    pick={i === 0}
                    disabled={Boolean(n.locking)}
                    choosing={n.locking === r.offerId}
                    onChoose={() => void n.lock(r.offerId)}
                  />
                );
              })}
              {result && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Why our pick? </span>
                  {result.recommendation}
                </p>
              )}
              <Link href={`/deals/${session.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ColumnsIcon className="size-4" /> Compare all offers side by side
              </Link>
            </div>
          )}

          {session.messages.length > 0 && (
            <section className="surface overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLog((s) => !s)}
                aria-expanded={showLog}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">See how the agents negotiated</span>
                  <span className="block text-xs text-muted-foreground">{session.messages.length} messages between your agent and the stores</span>
                </span>
                <ChevronDownIcon className={`size-5 text-muted-foreground transition-transform ${showLog ? "rotate-180" : ""}`} />
              </button>
              {showLog && (
                <div className="border-t">
                  <NegotiationTimeline session={session} streaming={n.streaming} lastEventAt={n.lastEventAt} embedded />
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <RequestSummary session={session} />
          <section className="surface flex h-[420px] flex-col overflow-hidden" aria-label="Ask your agent">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <MessageCircleIcon className="size-4 text-brand-ink" />
              <div>
                <h2 className="text-sm font-semibold">Ask your agent</h2>
                <p className="text-xs text-muted-foreground">Change your mind, ask “why?”, or say “go with Vantage”</p>
              </div>
            </div>
            <ChatWindow
              className="min-h-0 flex-1"
              session={session}
              sending={n.sending}
              streaming={n.streaming}
              onSend={(t) => void send(t)}
              quickReplies={result && !locked ? ["Why this one?", "I want a longer warranty", "Cheaper please"] : []}
            />
          </section>
        </aside>
      </div>

      {(best || locked) && !running && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          {locked && n.order ? (
            <Button asChild className="w-full" size="lg">
              <Link href={`/orders/${n.order.id}`}>
                Review & pay · {formatMoney(n.order.totalCents)}{n.order.booking ? " token" : ""} <ArrowRightIcon />
              </Link>
            </Button>
          ) : best ? (
            <Button className="w-full" size="lg" disabled={Boolean(n.locking)} onClick={() => void n.lock(best.offerId)}>
              Choose our pick · {formatMoney(best.totalCents)}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
