"use client";

import { formatMoney } from "@/lib/nexus/money";
import { INCENTIVE_LEVERS, type IncentiveLever } from "@/lib/nexus/types";

/* Fixed categorical order, validated for adjacent CVD separation (dataviz validator). */
const COLOR: Record<IncentiveLever, string> = { warranty: "#24508F", express: "#0891B2", shipping: "#BE185D", bundle: "#A8772A" };
const LABEL: Record<IncentiveLever, string> = { warranty: "Warranty", express: "Express delivery", shipping: "Free shipping", bundle: "Bundles" };

export function IncentiveAllocator({
  allocation,
  campaignBudget,
  remaining,
  onChange,
}: {
  allocation: Record<IncentiveLever, number>;
  campaignBudget: number;
  remaining: Record<IncentiveLever, number>;
  onChange: (a: Record<IncentiveLever, number>) => void;
}) {
  const total = INCENTIVE_LEVERS.reduce((s, l) => s + allocation[l], 0);
  const over = total > 1.0001;
  return (
    <section className="surface space-y-4 p-4" aria-labelledby="incentive-title">
      <div className="flex items-baseline justify-between">
        <h2 id="incentive-title" className="text-sm font-semibold">
          Incentive allocation
        </h2>
        <span className={`tabular text-xs ${over ? "font-semibold text-error-ink" : "text-muted-foreground"}`}>{Math.round(total * 100)}% of campaign</span>
      </div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-secondary" role="img" aria-label="Campaign budget allocation by incentive">
        {INCENTIVE_LEVERS.filter((l) => allocation[l] > 0).map((l) => (
          <div key={l} style={{ width: `${(allocation[l] / Math.max(1, total)) * 100}%`, background: COLOR[l] }} />
        ))}
      </div>
      <ul className="space-y-3">
        {INCENTIVE_LEVERS.map((l) => {
          const budget = Math.round(campaignBudget * allocation[l]);
          const left = Math.max(0, remaining[l]);
          return (
            <li key={l} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-sm" style={{ background: COLOR[l] }} aria-hidden />
                <span className="font-medium">{LABEL[l]}</span>
                <span className="tabular ml-auto text-muted-foreground">
                  {formatMoney(left)} left of {formatMoney(budget)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(allocation[l] * 100)}
                onChange={(e) => onChange({ ...allocation, [l]: Number(e.target.value) / 100 })}
                className="w-full accent-[var(--brand)]"
                aria-label={`${LABEL[l]} share of campaign budget`}
                aria-valuetext={`${Math.round(allocation[l] * 100)}%`}
              />
            </li>
          );
        })}
      </ul>
      {over && <p className="text-xs text-error-ink">Allocation can’t exceed 100% of the campaign budget.</p>}
    </section>
  );
}
