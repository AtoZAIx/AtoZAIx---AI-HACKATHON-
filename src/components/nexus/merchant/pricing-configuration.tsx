"use client";

import { cn } from "cn";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import type { WorkspaceListing } from "@/lib/nexus/merchant-workspace";
import { formatMoney } from "@/lib/nexus/money";
import { MoneyInput } from "./money-input";

export type EditableListing = Pick<WorkspaceListing, "id" | "costCents" | "listPriceCents" | "maxSellingPriceCents" | "floorPriceCents" | "stock">;

export function listingErrors(l: EditableListing): string[] {
  const e: string[] = [];
  if (l.floorPriceCents > l.listPriceCents) e.push("Minimum selling price is above the asking price");
  if (l.listPriceCents > l.maxSellingPriceCents) e.push("Asking price is above the maximum selling price");
  if (l.floorPriceCents < l.costCents) e.push("Minimum selling price is below cost");
  return e;
}

/** Price ladder: cost → effective minimum → asking → maximum, on one axis. */
function PriceLadder({ l, effectiveMin }: { l: EditableListing; effectiveMin: number }) {
  const max = Math.max(l.maxSellingPriceCents, effectiveMin, l.listPriceCents) * 1.02;
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="relative h-5 w-full min-w-28" aria-hidden>
      <div className="absolute top-2 h-1 w-full rounded-full bg-secondary" />
      <div className="absolute top-2 h-1 rounded-full bg-brand/40" style={{ left: pos(effectiveMin), width: `calc(${pos(l.listPriceCents)} - ${pos(effectiveMin)})` }} />
      <span className="absolute top-1 h-3 w-0.5 bg-foreground/50" style={{ left: pos(l.costCents) }} title="Cost" />
      <span className="absolute top-0.5 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-brand" style={{ left: pos(effectiveMin) }} />
      <span className="absolute top-0.5 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-graphite" style={{ left: pos(l.listPriceCents) }} />
    </div>
  );
}

export function PricingConfiguration({
  listings,
  edits,
  onEdit,
}: {
  listings: WorkspaceListing[];
  edits: Record<string, EditableListing>;
  onEdit: (id: string, patch: Partial<EditableListing>) => void;
}) {
  return (
    <section className="surface overflow-hidden" aria-labelledby="pricing-title">
      <div className="border-b px-4 py-3">
        <h2 id="pricing-title" className="text-sm font-semibold">
          Commercial pricing configuration
        </h2>
        <p className="text-xs text-muted-foreground">
          Effective minimum = strictest of your minimum selling price, cost + minimum profit, minimum margin, discount cap and remaining concession budget.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-2 py-2 font-medium">Product cost</th>
              <th className="px-2 py-2 font-medium">Initial asking</th>
              <th className="px-2 py-2 font-medium">Max selling</th>
              <th className="px-2 py-2 font-medium">Min selling</th>
              <th className="px-2 py-2 font-medium">Stock</th>
              <th className="px-2 py-2 font-medium">Effective min · margin</th>
              <th className="px-4 py-2 font-medium">Price ladder</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {listings.map((row) => {
              const l = edits[row.id];
              const errs = listingErrors(l);
              const dirty = l.costCents !== row.costCents || l.listPriceCents !== row.listPriceCents || l.maxSellingPriceCents !== row.maxSellingPriceCents || l.floorPriceCents !== row.floorPriceCents || l.stock !== row.stock;
              return (
                <tr key={row.id} className={cn(dirty && "bg-brand-soft/30")}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{row.productName}</p>
                    {errs.length > 0 ? <p className="text-[11px] text-error-ink">{errs[0]}</p> : <p className="text-[11px] text-muted-foreground">{row.note}</p>}
                  </td>
                  <td className="w-28 px-2">
                    <MoneyInput label={`${row.productName} cost`} cents={l.costCents} onChange={(c) => onEdit(row.id, { costCents: c })} invalid={errs.some((e) => e.includes("cost"))} />
                  </td>
                  <td className="w-28 px-2">
                    <MoneyInput label={`${row.productName} asking price`} cents={l.listPriceCents} onChange={(c) => onEdit(row.id, { listPriceCents: c })} />
                  </td>
                  <td className="w-28 px-2">
                    <MoneyInput label={`${row.productName} maximum selling price`} cents={l.maxSellingPriceCents} onChange={(c) => onEdit(row.id, { maxSellingPriceCents: c })} invalid={errs.some((e) => e.includes("maximum"))} />
                  </td>
                  <td className="w-28 px-2">
                    <MoneyInput label={`${row.productName} minimum selling price`} cents={l.floorPriceCents} onChange={(c) => onEdit(row.id, { floorPriceCents: c })} invalid={errs.some((e) => e.includes("Minimum"))} />
                  </td>
                  <td className="w-20 px-2">
                    <input
                      aria-label={`${row.productName} stock`}
                      inputMode="numeric"
                      value={l.stock}
                      onChange={(e) => onEdit(row.id, { stock: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                      className="tabular h-9 w-full rounded-lg border bg-background px-2 outline-none focus:border-brand/50"
                    />
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    <p className="tabular font-medium">{formatMoney(row.effectiveMinCents)}</p>
                    <p className="tabular text-[11px] text-muted-foreground">{(row.marginAtMinPct * 100).toFixed(1)}% margin</p>
                  </td>
                  <td className="w-44 px-4">
                    <PriceLadder l={l} effectiveMin={row.effectiveMinCents} />
                    <div className="mt-1">
                      {row.protection === "blocked" ? (
                        <StatusBadge tone="error" label="Withheld" />
                      ) : row.protection === "raised" ? (
                        <StatusBadge tone="warning" label="Guardrail raised" />
                      ) : (
                        <StatusBadge tone="success" label="Protected" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        Ladder: tick = cost · blue dot = effective minimum · dark dot = asking price · shaded band = negotiable range. Effective minimums refresh after saving.
      </p>
    </section>
  );
}
