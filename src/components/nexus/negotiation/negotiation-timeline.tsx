"use client";

import { RadioIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "cn";
import { AGENT_STYLE, AgentAvatar } from "@/components/nexus/agent-avatar";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { StatusBadge, type Tone } from "@/components/nexus/common/status-badge";
import { agentName } from "@/lib/nexus/directory";
import type { AgentMessage, CommerceSession, Offer } from "@/lib/nexus/types";
import { CounterOfferCard } from "./counter-offer-card";
import { OfferCard } from "./offer-card";
import { LocalTime } from "@/components/nexus/common/local-time";

function eventType(m: AgentMessage, offer: Offer | undefined): string {
  switch (m.kind) {
    case "rfq":
      return "Asked stores for prices";
    case "counter":
      return "Asked for a better price";
    case "decline":
      return "Can't offer";
    case "final":
      return "Best and final price";
    case "accept":
      return m.from === "coordinator" ? "Deal locked" : "Accepted your agent's price";
    case "note":
      return "Note";
    case "offer":
      return offer?.kind === "opening" ? "First price" : "New price";
  }
}

function offerStatus(offer: Offer, session: CommerceSession): { label: string; tone: Tone } {
  if (session.agreement?.offerId === offer.id) return session.agreement.verification.ok ? { label: "You chose this", tone: "success" } : { label: "Failed safety checks", tone: "error" };
  if (offer.kind === "declined") return { label: "No offer", tone: "neutral" };
  const latest = [...session.offers].reverse().find((o) => o.merchantId === offer.merchantId);
  if (latest && latest.id !== offer.id) return { label: "Replaced by a newer price", tone: "neutral" };
  if (offer.acceptsCounterId) return { label: "Agreed to your agent's price", tone: "success" };
  if (offer.kind === "final") return { label: "Final price", tone: "warning" };
  return { label: "Latest price", tone: "brand" };
}

/** Center panel: every real protocol event, in order, as it streams. */
export function NegotiationTimeline({ session, streaming, lastEventAt, embedded }: { session: CommerceSession; streaming: boolean; lastEventAt: string | null; embedded?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (near || streaming) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [session.messages.length, streaming]);

  const offers = useMemo(() => new Map(session.offers.map((o) => [o.id, o])), [session.offers]);
  const counters = useMemo(() => new Map(session.counters.map((c) => [c.id, c])), [session.counters]);

  return (
    <div className={cn("flex flex-col overflow-hidden", embedded ? "max-h-[70vh]" : "surface min-h-[420px] xl:h-[calc(100dvh-12rem)]")}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", embedded && "hidden")}>
        <div>
          <h2 className="text-sm font-semibold">Live agent negotiation</h2>
          <p className="text-xs text-muted-foreground">{session.messages.length} events · streamed from the coordinator</p>
        </div>
        {streaming ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink">
            <RadioIcon className="size-3.5 animate-pulse" /> Live
          </span>
        ) : lastEventAt ? (
          <span className="text-xs text-muted-foreground">Last event <LocalTime iso={lastEventAt} mode="time-s" /></span>
        ) : null}
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto" data-testid="protocol-feed">
        {session.messages.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={RadioIcon}
              title={streaming ? "Opening the negotiation room…" : "No negotiation yet"}
              description={streaming ? "The coordinator is broadcasting your request." : "Events appear here as soon as agents start negotiating."}
            />
          </div>
        ) : (
          <ol className="relative space-y-1 p-3 md:p-4">
            <AnimatePresence initial={false}>
              {session.messages.map((m) => {
                const offer = m.offerId ? offers.get(m.offerId) : undefined;
                const counter = m.counterId ? counters.get(m.counterId) : undefined;
                const prev = offer ? session.offers.filter((o) => o.merchantId === offer.merchantId && o.version === offer.version - 1)[0] : undefined;
                const status = offer ? offerStatus(offer, session) : null;
                return (
                  <motion.li
                    key={m.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-3 rounded-xl px-2 py-2.5"
                    data-kind={m.kind}
                  >
                    <AgentAvatar id={m.from} size="md" className="mt-0.5" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={cn("font-semibold", AGENT_STYLE[m.from].text)}>{agentName(m.from)}</span>
                        <span className="text-muted-foreground">→ {agentName(m.to)}</span>
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium">{eventType(m, offer)}</span>
                        <span className="tabular text-muted-foreground">Round {m.round}</span>
                        {offer && offer.version > 0 && <span className="tabular text-muted-foreground">Price #{offer.version}</span>}
                        <time className="tabular ml-auto text-muted-foreground" dateTime={m.createdAt}>
                          <LocalTime iso={m.createdAt} mode="time-s" />
                        </time>
                      </div>
                      <p className="text-sm leading-relaxed">{m.text}</p>
                      {offer?.terms && <OfferCard offer={offer} previous={prev} compact />}
                      {counter && <CounterOfferCard counter={counter} />}
                      {status && <StatusBadge tone={status.tone} label={status.label} />}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </div>
  );
}
