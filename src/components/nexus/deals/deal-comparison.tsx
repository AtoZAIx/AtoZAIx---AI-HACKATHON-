"use client";

import { ArrowRightIcon, BadgeCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { AGENT_STYLE } from "@/components/nexus/agent-avatar";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { useNegotiation } from "@/hooks/use-negotiation";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import { offerFacts } from "@/lib/nexus/offer-view";
import type { CommerceSession, NexusOrder, Product } from "@/lib/nexus/types";
import { DealScore } from "./deal-score";

const SPEC_ROWS: Array<{ label: string; get: (p: Product) => string | null }> = [
  { label: "Processor", get: (p) => p.specs.cpu ?? null },
  { label: "Memory", get: (p) => (p.specs.ramGb ? `${p.specs.ramGb}GB` : null) },
  { label: "Storage", get: (p) => (p.specs.storageGb ? (p.specs.storageGb >= 1024 ? `${p.specs.storageGb / 1024}TB` : `${p.specs.storageGb}GB`) : null) },
  { label: "Graphics", get: (p) => p.specs.gpu ?? null },
  { label: "Display", get: (p) => (p.specs.display ? `${p.specs.displayIn ? `${p.specs.displayIn}" ` : ""}${p.specs.display}` : null) },
  { label: "Camera", get: (p) => p.specs.camera ?? null },
  { label: "Battery", get: (p) => (p.specs.batteryHours ? `${p.specs.batteryHours}h` : null) },
  { label: "Weight", get: (p) => (p.specs.weightKg ? `${p.specs.weightKg}kg` : null) },
];

/** Side-by-side comparison of every final offer, with verified vs unknown facts kept apart. */
export function DealComparison({ initial, initialOrder }: { initial: CommerceSession; initialOrder: NexusOrder | null }) {
  const n = useNegotiation(initial, initialOrder);
  const session = n.session!;
  const ranking = session.result?.ranking ?? [];
  const agreed = session.agreement?.verification.ok ? session.agreement.offerId : null;
  const cols = ranking.map((r) => {
    const offer = session.offers.find((o) => o.id === r.offerId)!;
    return { r, offer, product: getProduct(offer.terms!.productId), facts: offerFacts(session, offer) };
  });
  const products = cols.map((c) => c.product);
  const specRows = SPEC_ROWS.filter((row) => products.some((p) => row.get(p)));

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Final offers compared side by side</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="sticky left-0 z-10 w-40 bg-card p-4 text-left align-bottom">
                <span className="eyebrow">Ranked by your buyer agent</span>
              </th>
              {cols.map(({ r, product }, i) => (
                <th key={r.offerId} scope="col" className={cn("p-4 text-left align-top font-normal", i === 0 && "bg-brand-soft/40")}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                      {i === 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Recommended</span>}
                    </div>
                    <ProductTile product={product} className="size-20" />
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("size-1.5 rounded-full", AGENT_STYLE[r.merchantId].dot)} aria-hidden />
                        {MERCHANT_DIRECTORY[r.merchantId].name}
                      </p>
                    </div>
                    <SimulatedBadge />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            <Row label="Negotiated price" hint="Delivered total">
              {cols.map(({ r, facts }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  <span className="tabular text-xl font-semibold">{formatMoney(facts.total)}</span>
                </td>
              ))}
            </Row>
            <Row label="Original price" hint="Merchant-stated list price">
              {cols.map(({ r, facts }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  <span className="tabular">{formatMoney(facts.listTotal)}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{agreed === r.offerId ? "verified against listing" : "merchant-stated"}</span>
                </td>
              ))}
            </Row>
            <Row label="Savings" hint="vs merchant list price">
              {cols.map(({ r, facts }, i) => (
                <td key={r.offerId} className={cn("tabular p-4", i === 0 && "bg-brand-soft/40", facts.savings > 0 && "text-success-ink")}>
                  {facts.savings > 0 ? `${formatMoney(facts.savings)} (${(facts.discountPct * 100).toFixed(1)}%)` : "None"}
                </td>
              ))}
            </Row>
            {specRows.map((row) => (
              <Row key={row.label} label={row.label}>
                {cols.map(({ r, product }, i) => {
                  const v = row.get(product);
                  return (
                    <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40", !v && "text-muted-foreground")}>
                      {v ?? <span className="text-xs">Not provided</span>}
                    </td>
                  );
                })}
              </Row>
            ))}
            <Row label="Delivery estimate">
              {cols.map(({ r, offer }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  {offer.terms!.deliveryDays} day{offer.terms!.deliveryDays === 1 ? "" : "s"}
                  {offer.terms!.express ? " express" : ""} · {offer.terms!.shippingCents ? `${formatMoney(offer.terms!.shippingCents)} shipping` : "free shipping"}
                </td>
              ))}
            </Row>
            <Row label="Warranty">
              {cols.map(({ r, offer }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  {offer.terms!.warrantyMonths} months
                </td>
              ))}
            </Row>
            <Row label="Return policy">
              {cols.map(({ r, offer }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  {offer.terms!.returnDays}-day returns
                </td>
              ))}
            </Row>
            <Row label="Incentives">
              {cols.map(({ r, facts }, i) => (
                <td key={r.offerId} className={cn("p-4 text-xs", i === 0 && "bg-brand-soft/40", !facts.incentives.length && "text-muted-foreground")}>
                  {facts.incentives.length ? facts.incentives.join(" · ") : "None"}
                </td>
              ))}
            </Row>
            <Row label="Transparent score">
              {cols.map(({ r }, i) => (
                <td key={r.offerId} className={cn("p-4 align-top", i === 0 && "bg-brand-soft/40")}>
                  <DealScore ranked={r} priority={session.intent!.priority} />
                </td>
              ))}
            </Row>
            <Row label="">
              {cols.map(({ r }, i) => (
                <td key={r.offerId} className={cn("p-4", i === 0 && "bg-brand-soft/40")}>
                  {agreed === r.offerId && n.order ? (
                    <Button asChild className="w-full">
                      <Link href={`/orders/${n.order.id}`}>
                        <BadgeCheckIcon /> Review purchase
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={i === 0 ? "default" : "outline"}
                      disabled={Boolean(n.locking) || Boolean(agreed)}
                      onClick={() => void n.lock(r.offerId)}
                      data-testid={`compare-lock-${r.merchantId}`}
                    >
                      {n.locking === r.offerId && <Loader2Icon className="animate-spin" />}
                      Select deal <ArrowRightIcon />
                    </Button>
                  )}
                </td>
              ))}
            </Row>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 bg-card p-4 text-left align-top font-normal">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </th>
      {children}
    </tr>
  );
}
