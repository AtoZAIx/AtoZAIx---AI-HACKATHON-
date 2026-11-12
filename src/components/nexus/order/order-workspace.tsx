"use client";

import { ArrowLeftIcon, CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { JourneySteps } from "@/components/nexus/common/journey-steps";
import { OrderStatusBadge } from "@/components/nexus/common/status-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { confirmWithPasskey } from "@/lib/nexus/passkey-client";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { NexusOrder } from "@/lib/nexus/types";
import { OrderTimeline } from "./order-timeline";
import { PayPalCheckout, type PaymentsConfig } from "./paypal-checkout";
import { PurchaseApproval } from "./purchase-approval";
import { PaymentResult } from "./payment-result";
import { paymentOutcome } from "@/lib/nexus/payment-outcome";
import type { Purchase } from "@/lib/nexus/budget";
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
export function OrderWorkspace({ initial, payments, purchases = [] }: { initial: NexusOrder; payments: PaymentsConfig; purchases?: Purchase[] }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const product = getProduct(order.terms.productId);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];

  const refresh = useCallback(async () => {
    const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}`);
    setOrder(data.order);
  }, [order.id]);

  const pending = order.status === "payment_captured" || paymentOutcome(order)?.kind === "pending";
  // While anything is pending (PayPal's review or its signed confirmation), poll the backend rather than assuming success.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void refresh().catch(() => null), 3000);
    return () => clearInterval(t);
  }, [pending, refresh]);

  async function approve(withPasskey: boolean) {
    setBusy(true);
    try {
      // Big approvals: the passkey check is bound to this order's amount and terms, and verified on the server.
      const passkey = withPasskey ? await confirmWithPasskey(order.id) : undefined;
      const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}/approve`, {
        json: { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion, ...(passkey ? { passkey } : {}) },
        headers: { "Idempotency-Key": `approve-${order.id}-${order.termsHash.slice(0, 16)}-v${order.agreementVersion}${passkey ? `-pk-${passkey.signature.slice(0, 12)}` : ""}` },
      });
      setOrder(data.order);
      toast.success(passkey ? "Confirmed with your passkey. Continue to PayPal to pay." : "Approved. Continue to PayPal to pay.");
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
        <PurchaseApproval order={order} expiresInMs={new Date(order.terms.expiresAt).getTime() - now} busy={busy} onApprove={approve} purchases={purchases} />
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

  const outcome = paymentOutcome(order);
  // PayPal buttons stay open before paying, and after a decline that can be retried right there.
  const showCheckout = (order.status === "approved" || order.status === "payment_pending") && (!outcome || outcome.retry === "checkout");
  const captured = Boolean(order.payment?.captureId) && order.status !== "payment_failed";

  return (
    <div className="space-y-6">
      {header}
      {outcome && <PaymentResult order={order} outcome={outcome} simulator={payments.provider === "simulated"} onOrder={setOrder} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {showCheckout ? (
            <PayPalCheckout order={order} payments={payments} onOrder={setOrder} />
          ) : !captured ? null : (
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
                <p className="text-xs text-muted-foreground">{order.booking ? "listed by" : "from"} {merchant.name}</p>
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
                {order.booking ? (
                  <tr>
                    <td className="py-2 text-muted-foreground">Agreed price {formatMoney(order.booking.dealTotalCents)}; settled with the seller later, not through this app</td>
                    <td className="tabular py-2 text-right text-muted-foreground">{formatMoney(order.booking.balanceDueCents)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td className="py-2 text-muted-foreground">Shipping</td>
                    <td className="tabular py-2 text-right">{order.shippingCents ? formatMoney(order.shippingCents) : "Free"}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="py-3">{order.booking ? "Paid with PayPal (refundable token)" : "Total"}</td>
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
