"use client";

import { ArrowLeftIcon, ArrowRightIcon, BadgeCheckIcon, CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { JourneySteps } from "@/components/nexus/common/journey-steps";
import { OrderStatusBadge } from "@/components/nexus/common/status-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { NexusOrder } from "@/lib/nexus/types";
import { OrderTimeline } from "./order-timeline";
import { PayPalCheckout, type PaymentsConfig } from "./paypal-checkout";
import { PurchaseApproval } from "./purchase-approval";
import { LocalTime } from "@/components/nexus/common/local-time";

export type { PaymentsConfig };

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Approval → PayPal → confirmation, driven entirely by backend order state. */
export function OrderWorkspace({ initial, payments }: { initial: NexusOrder; payments: PaymentsConfig }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const product = getProduct(order.terms.productId);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];

  const refresh = useCallback(async () => {
    const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}`);
    setOrder(data.order);
  }, [order.id]);

  // While a webhook is outstanding, poll the backend rather than assuming success.
  useEffect(() => {
    if (order.status !== "payment_captured") return;
    const t = setInterval(() => void refresh().catch(() => null), 3000);
    return () => clearInterval(t);
  }, [order.status, refresh]);

  async function approve() {
    setBusy(true);
    try {
      const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}/approve`, {
        json: { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion },
        headers: { "Idempotency-Key": `approve-${order.id}-${order.termsHash.slice(0, 16)}-v${order.agreementVersion}` },
      });
      setOrder(data.order);
      toast.success("Approved. Continue to PayPal to pay.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
      await refresh().catch(() => null);
    } finally {
      setBusy(false);
    }
  }

  const step = ["confirmed", "refunded", "disputed"].includes(order.status) ? "done" : order.status === "cancelled" ? "choose" : "pay";
  const header = (
    <div className="space-y-4">
      <JourneySteps current={step} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/negotiations/${order.sessionId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Back to the offers
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{order.id}</span>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>
    </div>
  );

  if (order.status === "awaiting_approval") {
    return (
      <div className="space-y-6">
        {header}
        <PurchaseApproval order={order} expiresInMs={new Date(order.terms.expiresAt).getTime() - now} busy={busy} onApprove={approve} />
      </div>
    );
  }

  if (order.status === "cancelled") {
    return (
      <div className="space-y-6">
        {header}
        <div className="surface mx-auto max-w-xl space-y-3 p-6 text-center">
          <CircleAlertIcon className="mx-auto size-8 text-warning" />
          <h1 className="text-lg font-semibold">This approval no longer applies</h1>
          <p className="text-sm text-muted-foreground">The negotiation was re-opened, so agreement v{order.agreementVersion} was superseded and this order was cancelled. Any new terms need a fresh approval.</p>
          <Button asChild>
            <Link href={`/negotiations/${order.sessionId}`}>Back to negotiation</Link>
          </Button>
        </div>
      </div>
    );
  }

  const confirmed = order.status === "confirmed";
  const trouble = order.status === "payment_failed" || order.status === "disputed" || order.status === "refunded";

  return (
    <div className="space-y-6">
      {header}
      {confirmed && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success-soft/60 p-5 sm:flex-row sm:items-center" data-testid="order-confirmed">
          <BadgeCheckIcon className="size-8 shrink-0 text-success" />
          <div className="flex-1">
            <p className="font-semibold">You’re all set. Your order is paid and confirmed.</p>
            <p className="text-sm text-muted-foreground">
              You paid {formatMoney(order.totalCents)} to {merchant.name}. We double-checked with PayPal that the right amount went to the right store.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/payments/${order.id}`}>
              See payment details <ArrowRightIcon />
            </Link>
          </Button>
        </motion.div>
      )}
      {trouble && (
        <div className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error-soft/60 p-5 sm:flex-row sm:items-center">
          <CircleAlertIcon className="size-7 shrink-0 text-error" />
          <p className="flex-1 text-sm">
            {order.status === "payment_failed"
              ? "Something didn’t match what you approved, so we didn’t confirm this order."
              : order.status === "refunded"
                ? "This payment was refunded."
                : "A dispute was opened with PayPal for this payment."}
          </p>
          <Button asChild variant="outline">
            <Link href={`/payments/${order.id}`}>View details</Link>
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {!confirmed && !trouble ? (
            <PayPalCheckout order={order} payments={payments} onOrder={setOrder} />
          ) : (
            <section className="surface space-y-4 p-5">
              <h2 className="text-lg font-semibold">Receipt</h2>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <Pair label="Amount paid" value={order.payment?.capturedAmountCents != null ? `${formatMoney(order.payment.capturedAmountCents)} ${order.payment.capturedCurrency}` : "—"} />
                <Pair label="Paid to" value={merchant.name} />
                <Pair label="Order number" value={order.id} mono />
                <Pair label="PayPal reference" value={order.payment?.paypalOrderId ?? "—"} mono />
              </dl>
            </section>
          )}
          <section className="surface space-y-4 p-5">
            <div className="flex items-center gap-3">
              <ProductTile product={product} className="size-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">from {merchant.name}</p>
              </div>
              <p className="tabular text-xl font-semibold">{formatMoney(order.totalCents)}</p>
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">Order summary</caption>
              <tbody className="divide-y">
                {order.lineItems.map((l) => (
                  <tr key={l.sku}>
                    <td className="py-2">
                      {l.name}
                      {l.quantity > 1 && <span className="text-muted-foreground"> × {l.quantity}</span>}
                    </td>
                    <td className="tabular py-2 text-right">{l.unitPriceCents ? formatMoney(l.unitPriceCents * l.quantity) : "Included"}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-muted-foreground">Shipping</td>
                  <td className="tabular py-2 text-right">{order.shippingCents ? formatMoney(order.shippingCents) : "Free"}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-3">Total</td>
                  <td className="tabular py-3 text-right" data-testid="order-total">
                    {formatMoney(order.totalCents)} {order.currency}
                  </td>
                </tr>
              </tbody>
            </table>
            {order.approval && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheckIcon className="size-4 text-success" /> You approved paying {formatMoney(order.approval.amountCents)} at{" "}
                <LocalTime iso={order.approval.approvedAt} mode="time-s" />.
              </p>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-6">
          <section className="surface space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">What happened</h2>
              {order.payment && (
                <Link href={`/payments/${order.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  Payment details
                </Link>
              )}
            </div>
            <OrderTimeline order={order} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "font-medium"}>{value}</dd>
    </div>
  );
}
