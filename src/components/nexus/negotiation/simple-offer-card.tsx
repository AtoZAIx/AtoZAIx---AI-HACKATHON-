"use client";

import { CheckIcon, Loader2Icon, PackageIcon, RotateCcwIcon, ShieldIcon, SparklesIcon, TruckIcon } from "lucide-react";
import { cn } from "cn";
import { AGENT_STYLE } from "@/components/nexus/agent-avatar";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { offerFacts } from "@/lib/nexus/offer-view";
import type { CommerceSession, Offer, RankedOffer } from "@/lib/nexus/types";
import { bookingToken, capitalize, termText } from "@/lib/nexus/vocab";

/** Reasons worth showing a shopper (skip technical or negative ones; those get their own warning). */
function goodReasons(r: RankedOffer): string[] {
  return r.reasons.filter((x) => !/over budget|below|slower|not a|GB|kg|GPU|model/i.test(x)).slice(0, 3);
}

/** One offer, in plain words: who, what, how much, what you get, and one button. */
export function SimpleOfferCard({
  session,
  offer,
  ranked,
  pick,
  disabled,
  choosing,
  onChoose,
}: {
  session: CommerceSession;
  offer: Offer;
  ranked: RankedOffer;
  pick?: boolean;
  disabled: boolean;
  choosing: boolean;
  onChoose: () => void;
}) {
  const t = offer.terms!;
  const product = getProduct(t.productId);
  const f = offerFacts(session, offer);
  const merchant = MERCHANT_DIRECTORY[offer.merchantId];
  const reasons = goodReasons(ranked);
  const words = termText(product.category, t);
  const token = bookingToken(product.category, f.total);
  return (
    <article
      data-testid={`offer-${offer.merchantId}`}
      className={cn("surface relative overflow-hidden", pick ? "border-brand/40 shadow-raised ring-4 ring-brand/10" : "")}
      aria-label={`${pick ? "Our pick: " : ""}${product.name} from ${merchant.name}, ${formatMoney(f.total)}`}
    >
      {pick && (
        <div className="flex items-center gap-2 bg-brand px-5 py-2 text-sm font-medium text-white">
          <SparklesIcon className="size-4" /> Our pick for you · Recommended
        </div>
      )}
      <div className={cn("flex flex-col gap-4 p-5", pick ? "sm:flex-row sm:items-center" : "sm:flex-row sm:items-center")}>
        <ProductTile product={product} className={pick ? "size-24 shrink-0" : "size-16 shrink-0"} />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className={cn("font-semibold", pick ? "text-lg" : "")}>{product.name}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className={cn("size-2 rounded-full", AGENT_STYLE[offer.merchantId].dot)} aria-hidden />
              {token ? "listed by" : "from"} {merchant.name} <SimulatedBadge label={token ? "Demo listing" : "Demo store"} />
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <li className="flex items-center gap-1.5">
              <TruckIcon className="size-4 text-muted-foreground" aria-hidden />
              {token ? capitalize(words.delivery) : `Arrives in ${t.deliveryDays} day${t.deliveryDays === 1 ? "" : "s"}`}
            </li>
            {words.warranty && (
              <li className="flex items-center gap-1.5">
                <ShieldIcon className="size-4 text-muted-foreground" aria-hidden />
                {capitalize(words.warranty)}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <RotateCcwIcon className="size-4 text-muted-foreground" aria-hidden />
              {capitalize(words.returns)}
            </li>
          </ul>
          {f.incentives.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-success-ink">
              <PackageIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              Free extras: {f.incentives.join(", ")}
            </p>
          )}
          {(reasons.length > 0 || !ranked.withinBudget) && (
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                  <CheckIcon className="size-3 text-success" aria-hidden />
                  {r}
                </span>
              ))}
              {!ranked.withinBudget && <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-ink">Over your budget</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="sm:text-right">
            <p className={cn("tabular font-semibold", pick ? "text-3xl" : "text-2xl")}>{formatMoney(f.total)}</p>
            {f.savings > 0 ? (
              <p className="tabular text-sm font-medium text-success-ink">You save {formatMoney(f.savings)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{token ? `Total ${words.v.totalSuffix}` : "Total with delivery"}</p>
            )}
            {token && (
              <p className="tabular text-xs text-muted-foreground" data-testid={`token-${offer.merchantId}`}>
                Book now with a {formatMoney(token.tokenCents)} refundable token
              </p>
            )}
            {session.intent?.askDiscountPct && offer.terms ? (
              <p className="tabular text-xs text-muted-foreground" data-testid={`mutual-${offer.merchantId}`}>
                {Math.round((1 - offer.terms.unitPriceCents / offer.terms.listPriceCents) * 100)}% off · you asked for {Math.round(session.intent.askDiscountPct * 100)}%
              </p>
            ) : null}
          </div>
          <Button size="lg" variant={pick ? "default" : "outline"} disabled={disabled} onClick={onChoose} data-testid={`lock-${offer.merchantId}`} className="min-w-40">
            {choosing && <Loader2Icon className="animate-spin" />}
            Choose this deal
          </Button>
        </div>
      </div>
    </article>
  );
}
