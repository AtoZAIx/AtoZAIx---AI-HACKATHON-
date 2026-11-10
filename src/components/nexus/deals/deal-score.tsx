import { InfoIcon } from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/nexus/money";
import type { PurchaseIntent, RankedOffer } from "@/lib/nexus/types";

const PRIORITY_NAME: Record<PurchaseIntent["priority"], string> = {
  balanced: "—",
  price: "Lowest total",
  warranty: "Warranty length",
  delivery: "Delivery speed",
  value: "Included extras",
};

/**
 * Transparent scoring. Every number here is the one the buyer agent used.
 * Merchant reliability is shown as not scored: there is no verified history
 * for simulated merchants, and Nexus doesn't invent one.
 */
export function DealScore({ ranked, priority }: { ranked: RankedOffer; priority: PurchaseIntent["priority"] }) {
  const b = ranked.breakdown;
  const rows: Array<{ label: string; value: string; bar: number | null; note: string }> = [
    {
      label: "Price",
      value: `${Math.round(b.costScore * 100)}`,
      bar: b.costScore,
      note: `Effective cost ${formatMoney(ranked.effectiveCents)} vs the cheapest effective offer. Weight ${Math.round(b.weights.cost * 100)}%.`,
    },
    {
      label: "Specifications",
      value: `${Math.round(b.fit * 100)}`,
      bar: b.fit,
      note: `Suitability for your stated use and requirements. Weight ${Math.round(b.weights.fit * 100)}%.`,
    },
    {
      label: "Warranty",
      value: b.warrantyValueCents ? `−${formatMoney(b.warrantyValueCents)}` : "$0",
      bar: null,
      note: "Value of warranty beyond 12 months, subtracted from the effective cost.",
    },
    {
      label: "Delivery",
      value: b.deliveryValueCents ? `−${formatMoney(b.deliveryValueCents)}` : "$0",
      bar: null,
      note: "Value of arriving faster than 5 days, subtracted from the effective cost.",
    },
  ];
  if (b.weights.priority > 0) {
    rows.push({
      label: `Priority: ${PRIORITY_NAME[priority]}`,
      value: `${Math.round(b.priorityScore * 100)}`,
      bar: b.priorityScore,
      note: `Your stated priority. Weight ${Math.round(b.weights.priority * 100)}%.`,
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Deal score</p>
        <p className="tabular text-xl font-semibold">{ranked.score}</p>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-1 text-muted-foreground" tabIndex={0}>
                  {r.label} <InfoIcon className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">{r.note}</TooltipContent>
            </Tooltip>
            {r.bar !== null ? (
              <span className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(r.bar * 100)}%` }} />
              </span>
            ) : (
              <span />
            )}
            <span className="tabular w-14 text-right font-medium">{r.value}</span>
          </li>
        ))}
        <li className="grid grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
          <span className="text-muted-foreground">Reliability</span>
          <span className={cn("rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning-ink")}>Not scored · no verified merchant history</span>
          <span className="w-14 text-right text-muted-foreground">—</span>
        </li>
      </ul>
    </div>
  );
}
