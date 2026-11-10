"use client";

import { ArrowRightIcon, Loader2Icon, LockIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { getProduct, specLine } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { NexusOrder } from "@/lib/nexus/types";

/** High-trust approval: the customer approves these exact terms, this version, this amount. */
export function PurchaseApproval({ order, expiresInMs, busy, onApprove }: { order: NexusOrder; expiresInMs: number; busy: boolean; onApprove: () => void }) {
  const [consent, setConsent] = useState(false);
  const t = order.terms;
  const product = getProduct(t.productId);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];
  const incentives = order.lineItems.filter((l) => l.kind !== "product").map((l) => l.name.replace(" (included)", ""));
  const expired = expiresInMs <= 0;

  return (
    <section className="mx-auto max-w-3xl space-y-6" aria-labelledby="approve-title">
      <div className="space-y-1.5 text-center">
        <p className="eyebrow">Purchase approval</p>
        <h1 id="approve-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Approve the exact terms
        </h1>
        <p className="text-sm text-muted-foreground">Check everything below. When you approve, you’ll pay with PayPal. Nothing is charged before that.</p>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ProductTile product={product} className="size-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold">{product.name}</p>
            <p className="text-xs text-muted-foreground">{specLine(product)}</p>
            <p className="flex items-center gap-2 pt-1 text-sm">
              <AgentAvatar id={order.merchantId} size="sm" /> {merchant.name} <SimulatedBadge />
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="divide-y">
            <Term label="Negotiated price" value={`${formatMoney(t.unitPriceCents)}${t.quantity > 1 ? ` × ${t.quantity}` : ""}`} />
            <Term label="Currency" value={order.currency} />
            <Term label="Delivery terms" value={`${t.deliveryDays} day${t.deliveryDays === 1 ? "" : "s"}${t.express ? " express" : ""} · ${t.shippingCents ? `${formatMoney(t.shippingCents)} shipping` : "free shipping"}`} />
            <Term label="Warranty" value={`${t.warrantyMonths} months`} />
          </div>
          <div className="divide-y">
            <Term label="Return policy" value={`${t.returnDays}-day returns`} />
            <Term label="Included incentives" value={incentives.length ? incentives.join(", ") : "None"} />
            <Term label="Deal version" value={`Version ${order.agreementVersion}`} />
            <Term label="Offer valid for" value={expired ? "Expired" : `${Math.floor(expiresInMs / 60000)}m ${Math.floor((expiresInMs % 60000) / 1000)}s`} warn={expired || expiresInMs < 120000} />
          </div>
        </dl>
        <div className="flex items-end justify-between gap-4 border-t bg-secondary/50 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Total payable</p>
            {order.savingsCents > 0 && <p className="tabular text-xs text-success-ink">{formatMoney(order.savingsCents)} below the merchant’s list price</p>}
          </div>
          <p className="tabular text-3xl font-semibold" data-testid="order-total">
            {formatMoney(order.totalCents)} <span className="text-base font-medium text-muted-foreground">{order.currency}</span>
          </p>
        </div>
      </div>

      <div className="surface space-y-4 p-5">
        <div className="flex items-start gap-3 text-sm">
          <input
            id="approval-consent"
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--brand)]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-describedby="approval-consent-text"
            data-testid="consent"
          />
          <label htmlFor="approval-consent" id="approval-consent-text">
            I approve paying <strong className="tabular">{formatMoney(order.totalCents)} {order.currency}</strong> to <strong>{merchant.name}</strong> for this deal exactly as shown. If
            anything changes, I’ll be asked to approve again.
          </label>
        </div>
        {expired && (
          <p className="flex items-center gap-1.5 text-sm text-error-ink">
            <TimerIcon className="size-4" /> The merchant’s offer expired. Re-negotiate for fresh terms.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline" size="lg">
            <Link href={`/deals/${order.sessionId}`}>Review Deal</Link>
          </Button>
          <Button size="lg" disabled={!consent || expired || busy} onClick={onApprove} data-testid="approve-order">
            {busy ? <Loader2Icon className="animate-spin" /> : <LockIcon />} Approve & Continue to PayPal <ArrowRightIcon />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Term({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-right text-sm font-medium ${mono ? "font-mono text-xs" : ""} ${warn ? "text-warning-ink" : ""}`}>{value}</dd>
    </div>
  );
}
