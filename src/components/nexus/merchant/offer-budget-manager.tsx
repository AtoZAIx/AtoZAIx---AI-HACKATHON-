"use client";

import { formatMoney } from "@/lib/nexus/money";
import type { LedgerEntry } from "@/lib/nexus/types";
import { MoneyInput } from "./money-input";

function BudgetBar({ label, total, remaining }: { label: string; total: number; remaining: number }) {
  const used = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {formatMoney(used)} used of {formatMoney(total)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${label}: ${formatMoney(used)} used of ${formatMoney(total)}`}>
        <div className="h-full rounded-r-[4px] bg-chart-2" style={{ width: `${pct}%` }} />
      </div>
      <p className="tabular text-[11px] text-muted-foreground">{formatMoney(Math.max(0, remaining))} remaining</p>
    </div>
  );
}

export function OfferBudgetManager({
  concessionBudget,
  campaignBudget,
  remainingConcession,
  remainingCampaign,
  onChange,
  ledger,
}: {
  concessionBudget: number;
  campaignBudget: number;
  remainingConcession: number;
  remainingCampaign: number;
  onChange: (patch: { concessionBudgetCents?: number; campaignBudgetCents?: number }) => void;
  ledger: LedgerEntry[];
}) {
  return (
    <section className="surface space-y-4 p-4" aria-labelledby="budget-title">
      <div>
        <h2 id="budget-title" className="text-sm font-semibold">
          Offer budget
        </h2>
        <p className="text-xs text-muted-foreground">Reserved when a deal is agreed, released if the order is cancelled.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Negotiation concession budget</span>
          <MoneyInput label="Negotiation concession budget" cents={concessionBudget} onChange={(c) => onChange({ concessionBudgetCents: c })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Campaign budget</span>
          <MoneyInput label="Campaign budget" cents={campaignBudget} onChange={(c) => onChange({ campaignBudgetCents: c })} />
        </label>
      </div>
      <BudgetBar label="Price concessions" total={concessionBudget} remaining={remainingConcession} />
      <BudgetBar label="Incentive campaign" total={campaignBudget} remaining={remainingCampaign} />
      <div>
        <p className="eyebrow pb-2">Offer budget ledger</p>
        {ledger.length === 0 ? (
          <p className="text-xs text-muted-foreground">No reservations yet. Entries appear when a shopper agrees one of your offers.</p>
        ) : (
          <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
            {ledger.map((e) => {
              const incentive = Object.values(e.incentiveCents).reduce((a, b) => a + b, 0);
              return (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={`w-16 shrink-0 font-medium capitalize ${e.type === "release" ? "text-success-ink" : e.type === "commit" ? "text-muted-foreground" : ""}`}>{e.type}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={e.note}>
                    {e.note}
                  </span>
                  <span className="tabular shrink-0">
                    {e.type === "release" ? "+" : e.type === "reserve" ? "−" : ""}
                    {formatMoney(e.concessionCents + incentive)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
