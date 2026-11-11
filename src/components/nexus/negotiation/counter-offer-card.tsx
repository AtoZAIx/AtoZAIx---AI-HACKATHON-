import { formatMoney } from "@/lib/nexus/money";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import type { BuyerCounter, Category } from "@/lib/nexus/types";
import { capitalize, VOCAB, vocabFor } from "@/lib/nexus/vocab";

/** The buyer agent's structured counteroffer. */
export function CounterOfferCard({ counter, category }: { counter: BuyerCounter; category?: Category }) {
  const v = category ? vocabFor(category) : VOCAB.goods;
  const goods = v === VOCAB.goods;
  const asks = [
    goods ? `Target ${formatMoney(counter.targetUnitPriceCents)} per unit` : `Target ${formatMoney(counter.targetUnitPriceCents)}${v.priceSuffix}`,
    counter.ask.freeShipping ? (goods ? "Free shipping" : capitalize(v.freeFeesAsk)) : null,
    counter.ask.warrantyMonths ? `${counter.ask.warrantyMonths}-month warranty` : null,
    counter.ask.express ? capitalize(v.fasterAsk) : null,
    counter.ask.bundle ? (goods ? "Accessories included" : "Extras included") : null,
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
          Leverage: {MERCHANT_DIRECTORY[counter.leverage.merchantId].name} at {formatMoney(counter.leverage.totalCents)} {v.totalSuffix}
          {counter.leverage.sameProduct ? (goods ? " (same model)" : " (same listing)") : goods ? " (comparable spec)" : " (comparable listing)"}
        </p>
      )}
    </div>
  );
}
