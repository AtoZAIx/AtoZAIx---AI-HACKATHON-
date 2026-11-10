"use client";

import { HandshakeIcon } from "lucide-react";
import { useId, useState } from "react";
import { agentDiscountCap, mutualPct } from "@/lib/nexus/agents/pricing";

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

/**
 * Merchant-only view of the mutual deal: where the store opens, how far the
 * agent may go (maximum × agent limit), and the protected rest. A small
 * calculator shows the deal for any shopper ask, using the same rule as the
 * negotiation engine. These numbers are never shown to shoppers.
 */
export function MutualDealZone({
  maxPct,
  agentLimitPct,
  openingPct,
  title = "Mutual deal zone",
  note,
}: {
  maxPct: number;
  agentLimitPct: number;
  openingPct: number;
  title?: string;
  note?: string;
}) {
  const [ask, setAsk] = useState(0.3);
  const askId = useId();
  const cap = agentDiscountCap({ maxDiscountPct: maxPct, agentLimitPct });
  const opening = Math.min(openingPct, cap);
  const deal = mutualPct(opening, ask, cap);
  const span = Math.max(maxPct, 0.0001);
  const w = (f: number) => `${Math.max(0, Math.min(100, (f / span) * 100))}%`;

  return (
    <div className="space-y-3 rounded-xl border p-3" data-testid="mutual-zone">
      <div className="flex items-start gap-2">
        <HandshakeIcon className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {note ??
              "Your agent opens at your opening discount and settles halfway to what the shopper asks for (20% if they don’t say). It never goes past your agent limit. Shoppers never see these numbers."}
          </p>
        </div>
      </div>

      <div aria-hidden className="space-y-1">
        <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
          <div className="bg-brand-soft" style={{ width: w(opening) }} />
          <div className="bg-brand" style={{ width: w(cap - opening) }} />
          <div className="bg-[repeating-linear-gradient(135deg,var(--border)_0_4px,transparent_4px_8px)]" style={{ width: w(maxPct - cap) }} />
        </div>
        <div className="relative h-4">
          <span className="absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded bg-foreground" style={{ left: w(Math.min(deal, maxPct)) }} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Store opens at</dt>
          <dd className="tabular font-semibold">{pct(opening)} off</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Agent never goes past</dt>
          <dd className="tabular font-semibold">{pct(cap)} off</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Protected, never used</dt>
          <dd className="tabular font-semibold">
            {pct(cap)} to {pct(maxPct)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Your maximum</dt>
          <dd className="tabular font-semibold">{pct(maxPct)} off</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
        <label htmlFor={askId}>If a shopper asks for</label>
        <span className="flex h-8 w-20 items-center gap-1 rounded-md border bg-background px-2">
          <input
            id={askId}
            inputMode="decimal"
            value={String(Math.round(ask * 1000) / 10)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (Number.isFinite(n)) setAsk(Math.min(90, n) / 100);
            }}
            className="tabular w-full min-w-0 bg-transparent outline-none"
            data-testid="mutual-ask"
          />
          <span className="text-muted-foreground">%</span>
        </span>
        <span>
          off, the deal closes at{" "}
          <b className="tabular" data-testid="mutual-result">
            {pct(deal)} off
          </b>
          .
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">Each product’s own floors (minimum price, profit and margin) still apply, so a deal can stop earlier.</p>
    </div>
  );
}
