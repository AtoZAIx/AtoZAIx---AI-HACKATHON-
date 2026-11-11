"use client";

import { ArrowRightIcon, FingerprintIcon, Loader2Icon, LockIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { getProduct, specLine } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { Purchase } from "@/lib/nexus/budget";
import type { NexusOrder } from "@/lib/nexus/types";
import { SpendGuard } from "./spend-guard";
import { PasskeyStep, type PasskeyState } from "./passkey-step";
import { stepUpRequired } from "@/lib/nexus/step-up";
import { capitalize, dealKind, termText } from "@/lib/nexus/vocab";

/** High-trust approval: the customer approves these exact terms, this version, this amount. */
export function PurchaseApproval({ order, expiresInMs, busy, onApprove, purchases = [] }: { order: NexusOrder; expiresInMs: number; busy: boolean; onApprove: (withPasskey: boolean) => void; purchases?: Purchase[] }) {
  const [consent, setConsent] = useState(false);
  // Spend Guard: approval stays locked while the purchase is over the customer's plan, until they choose to go over.
  const [guardBlocks, setGuardBlocks] = useState(false);
  const [override, setOverride] = useState(false);
  const onBlockingChange = useCallback((b: boolean) => setGuardBlocks(b), []);
  // Passkey step-up: required by the server for big amounts; also asked when the customer overrides Spend Guard.
  const [passkey, setPasskey] = useState<PasskeyState>("checking");
  const onPasskeyState = useCallback((s: PasskeyState) => setPasskey(s), []);
  const bigAmount = stepUpRequired(order);
  const overPlan = guardBlocks || override;
  const askPasskey = bigAmount || (override && passkey !== "unsupported");
  const passkeyBlocks = askPasskey && passkey !== "ready";
  const t = order.terms;
  const product = getProduct(t.productId);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];
  const incentives = order.lineItems.filter((l) => l.kind !== "product").map((l) => l.name.replace(" (included)", ""));
  const expired = expiresInMs <= 0;
  const words = termText(product.category, t);
  const booking = order.booking ?? null;
  const kind = dealKind(product.category);

  return (
    <section className="mx-auto max-w-3xl space-y-6" aria-labelledby="approve-title">
      <div className="space-y-1.5 text-center">
        <p className="eyebrow">Purchase approval</p>
        <h1 id="approve-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Approve the exact terms
        </h1>
        <p className="text-sm text-muted-foreground">
          {booking
            ? "Check everything below. When you approve, you’ll pay only a refundable booking token with PayPal. Nothing is charged before that."
            : "Check everything below. When you approve, you’ll pay with PayPal. Nothing is charged before that."}
        </p>
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
        <div className="grid grid-cols-1 divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <dl className="divide-y">
            <Term label="Negotiated price" value={`${formatMoney(t.unitPriceCents)}${t.quantity > 1 ? ` × ${t.quantity}` : ""}`} />
            <Term label="Currency" value={order.currency} />
            {booking ? (
              <>
                <Term label={kind === "rental" ? "Agreed rent" : "Agreed price"} value={`${formatMoney(t.unitPriceCents)}${words.v.priceSuffix}`} />
                <Term label={words.v.deliveryNoun} value={capitalize(words.delivery)} />
                <Term label={words.v.feesNoun} value={capitalize(words.fees)} />
                {words.warranty && <Term label="Warranty" value={capitalize(words.warranty)} />}
              </>
            ) : (
              <>
                <Term label="Delivery terms" value={`${t.deliveryDays} day${t.deliveryDays === 1 ? "" : "s"}${t.express ? " express" : ""} · ${t.shippingCents ? `${formatMoney(t.shippingCents)} shipping` : "free shipping"}`} />
                <Term label="Warranty" value={`${t.warrantyMonths} months`} />
              </>
            )}
          </dl>
          <dl className="divide-y">
            <Term label={booking ? words.v.returnsNoun : "Return policy"} value={booking ? capitalize(words.returns) : `${t.returnDays}-day returns`} />
            <Term label="Included incentives" value={incentives.length ? incentives.join(", ") : "None"} />
            <Term label="Deal version" value={`Version ${order.agreementVersion}`} />
            <Term label="Offer valid for" value={expired ? "Expired" : `${Math.floor(expiresInMs / 60000)}m ${Math.floor((expiresInMs % 60000) / 1000)}s`} warn={expired || expiresInMs < 120000} />
          </dl>
        </div>
        {booking && (
          <dl className="divide-y border-t" data-testid="booking-summary">
            <Term label={kind === "rental" ? "First month, incl. fees" : `Agreed total, ${words.v.totalSuffix}`} value={formatMoney(booking.dealTotalCents)} />
            <Term label="Booking token (refundable)" value={formatMoney(order.totalCents)} />
            <Term label={kind === "rental" ? "Paid to the landlord at move-in" : "Paid to the seller at closing"} value={formatMoney(booking.balanceDueCents)} />
          </dl>
        )}
        <div className="flex items-end justify-between gap-4 border-t bg-secondary/50 px-5 py-4">
          <div>
            <p className="text-sm font-medium">{booking ? "Pay now with PayPal" : "Total payable"}</p>
            {booking && <p className="text-xs text-muted-foreground">Token: {booking.rule}</p>}
            {order.savingsCents > 0 && booking && <p className="tabular text-xs text-success-ink">Your agent negotiated {formatMoney(order.savingsCents)} off the asking price</p>}
            {order.savingsCents > 0 && !booking && <p className="tabular text-xs text-success-ink">{formatMoney(order.savingsCents)} below the merchant’s list price</p>}
          </div>
          <p className="tabular text-3xl font-semibold" data-testid="order-total">
            {formatMoney(order.totalCents)} <span className="text-base font-medium text-muted-foreground">{order.currency}</span>
          </p>
        </div>
      </div>

      <div className="surface space-y-4 p-5">
        <SpendGuard
          item={{
            productId: t.productId,
            productName: product.name,
            totalCents: order.totalCents,
            ...(booking && kind !== "goods" ? { booking: { kind, dealTotalCents: booking.dealTotalCents, monthlyCents: t.unitPriceCents } } : {}),
          }}
          purchases={purchases}
          override={override}
          onOverride={setOverride}
          onBlockingChange={onBlockingChange}
        />
        {(bigAmount || (overPlan && override)) && <PasskeyStep reason={bigAmount ? "amount" : "over-plan"} onState={onPasskeyState} />}
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
            {booking ? (
              <>
                I approve paying a refundable booking token of <strong className="tabular">{formatMoney(order.totalCents)} {order.currency}</strong> to <strong>{merchant.name}</strong> to hold
                this deal exactly as shown. The remaining {formatMoney(booking.balanceDueCents)} is not charged here. If anything changes, I’ll be asked to approve again.
              </>
            ) : (
              <>
                I approve paying <strong className="tabular">{formatMoney(order.totalCents)} {order.currency}</strong> to <strong>{merchant.name}</strong> for this deal exactly as shown. If
                anything changes, I’ll be asked to approve again.
              </>
            )}
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
          <Button size="lg" disabled={!consent || expired || busy || guardBlocks || passkeyBlocks} onClick={() => onApprove(askPasskey)} data-testid="approve-order">
            {busy ? <Loader2Icon className="animate-spin" /> : askPasskey ? <FingerprintIcon /> : <LockIcon />} {booking ? "Approve & Pay Token with PayPal" : "Approve & Continue to PayPal"} <ArrowRightIcon />
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
