"use client";

import { ArrowDownIcon, Loader2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY, MERCHANT_IDS } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { CommerceSession } from "@/lib/nexus/types";
import type { PhaseState } from "@/hooks/use-negotiation";

/** While agents negotiate: each store's latest price, updating live. */
export function LiveProgress({ session, phase }: { session: CommerceSession; phase: PhaseState | null }) {
  const round = phase?.phase === "negotiating" ? phase.round : phase?.phase === "deciding" || phase?.phase === "complete" ? 3 : 0;
  const pct = phase?.phase === "deciding" ? 95 : phase?.phase === "complete" ? 100 : Math.max(8, (round / 3) * 85);
  return (
    <section className="surface space-y-5 p-5" aria-live="polite" aria-label="Live negotiation progress">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium">
            <Loader2Icon className="size-4 animate-spin text-brand" />
            {round === 0 ? "Asking 3 stores for their prices" : phase?.phase === "deciding" ? "Comparing the final offers" : `Round ${round} of 3: asking each store for a better price`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
        </div>
      </div>
      <ul className="divide-y rounded-xl border">
        {MERCHANT_IDS.map((id) => {
          const offers = session.offers.filter((o) => o.merchantId === id);
          const first = offers[0];
          const last = offers[offers.length - 1];
          const asked = session.counters.some((c) => c.merchantId === id && c.round === round) && (!last || last.round < round);
          const status = !last ? "Waiting for price" : last.kind === "declined" ? "Can't offer this" : asked ? "Thinking…" : last.kind === "final" ? "Best and final price" : last.round > 0 ? "Lowered the price" : "First price";
          return (
            <li key={id} className="flex items-center gap-3 px-4 py-3">
              <AgentAvatar id={id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{MERCHANT_DIRECTORY[id].name}</p>
                <p className="truncate text-xs text-muted-foreground">{last?.terms ? getProduct(last.terms.productId).name : status}</p>
              </div>
              <div className="text-right">
                {last?.totalCents ? (
                  <>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.p key={last.totalCents} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="tabular font-semibold">
                        {formatMoney(last.totalCents)}
                      </motion.p>
                    </AnimatePresence>
                    {first?.totalCents && first.totalCents > last.totalCents && (
                      <p className="tabular flex items-center justify-end gap-0.5 text-xs text-success-ink">
                        <ArrowDownIcon className="size-3" /> {formatMoney(first.totalCents - last.totalCents)} lower
                      </p>
                    )}
                  </>
                ) : (
                  <p className={cn("text-xs", last?.kind === "declined" ? "text-muted-foreground" : "text-brand-ink")}>{status}</p>
                )}
                {last?.totalCents && <p className="text-[11px] text-muted-foreground">{status}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Your budget is kept secret. Stores only see a target price, so they compete to give you a better deal.</p>
    </section>
  );
}
