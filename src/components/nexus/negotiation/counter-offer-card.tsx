import { formatMoney } from "@/lib/nexus/money";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import type { BuyerCounter } from "@/lib/nexus/types";

/** The buyer agent's structured counteroffer. */
export function CounterOfferCard({ counter }: { counter: BuyerCounter }) {
  const asks = [
    `Target ${formatMoney(counter.targetUnitPriceCents)} per unit`,
    counter.ask.freeShipping ? "Free shipping" : null,
    counter.ask.warrantyMonths ? `${counter.ask.warrantyMonths}-month warranty` : null,
    counter.ask.express ? "Express delivery" : null,
    counter.ask.bundle ? "Accessories included" : null,
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-xl border border-dashed border-brand/30 bg-brand-soft/40 p-3">
      <ul className="flex flex-wrap gap-1.5 text-[11px]">
        {asks.map((a) => (
          <li key={a} className="rounded-md bg-card px-1.5 py-0.5 font-medium text-brand-ink">
            {a}
          </li>
        ))}
      </ul>
      {counter.leverage && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Leverage: {MERCHANT_DIRECTORY[counter.leverage.merchantId].name} at {formatMoney(counter.leverage.totalCents)} delivered
          {counter.leverage.sameProduct ? " (same model)" : " (comparable spec)"}
        </p>
      )}
    </div>
  );
}
