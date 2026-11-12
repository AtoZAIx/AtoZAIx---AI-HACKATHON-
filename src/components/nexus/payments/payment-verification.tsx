"use client";

import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LocalTime } from "@/components/nexus/common/local-time";
import { OrderStatusBadge } from "@/components/nexus/common/status-badge";
import { PaymentLifecycle } from "@/components/nexus/order/payment-lifecycle";
import { OrderTimeline } from "@/components/nexus/order/order-timeline";
import { DealVerification } from "@/components/nexus/verification/deal-verification";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { formatMoney } from "@/lib/nexus/money";
import type { NexusOrder } from "@/lib/nexus/types";

/** Transaction verification: identifiers, captured amount, webhook and checks. */
export function PaymentVerification({ initial, simulator }: { initial: NexusOrder; simulator: boolean }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const p = order.payment!;
  const hook = p.webhooks.find((w) => w.signatureVerified && w.eventType === "PAYMENT.CAPTURE.COMPLETED");

  async function sim(key: string, path: string, json: unknown) {
    setBusy(key);
    try {
      const data = await api<{ order: NexusOrder; result: { status: number; detail: string } }>(path, { json });
      setOrder(data.order);
      toast.message(data.result.status === 200 ? "PayPal update received and checked" : "Fake PayPal message blocked. Your order is safe.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Simulator action failed");
    } finally {
      setBusy(null);
    }
  }

  const summary =
    order.status === "confirmed"
      ? { tone: "border-success/30 bg-success-soft/60", text: `Your payment is confirmed. PayPal received ${p.capturedAmountCents != null ? formatMoney(p.capturedAmountCents) : "the payment"} and every important check passed.` }
      : order.status === "payment_captured"
        ? { tone: "border-brand/30 bg-brand-soft/60", text: "PayPal took the payment. We’re waiting for PayPal’s confirmation message before marking it paid." }
        : order.status === "refunded"
          ? { tone: "border-border bg-secondary", text: "This payment was refunded." }
          : order.status === "disputed"
            ? { tone: "border-error/30 bg-error-soft/60", text: "A dispute was opened with PayPal for this payment." }
            : order.status === "payment_failed"
              ? { tone: "border-error/30 bg-error-soft/60", text: "Something didn’t match, so we did not confirm this order. See the checks below." }
              : { tone: "border-border bg-secondary", text: "Payment not finished yet." };
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <p className={`rounded-2xl border p-4 text-[15px] font-medium ${summary.tone}`} role="status">
          {summary.text}
        </p>
        <section className="surface p-5" aria-labelledby="ids-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="ids-title" className="text-sm font-semibold">
              Payment references
            </h2>
            <OrderStatusBadge status={order.status} />
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Id label="AtoZAIx order ID" value={order.id} />
            <Id label="PayPal order ID" value={p.paypalOrderId} />
            <Id label="PayPal capture ID" value={p.captureId ?? "Not captured"} />
            <Id label="Captured amount" value={p.capturedAmountCents != null ? formatMoney(p.capturedAmountCents) : "—"} plain />
            <Id label="Currency" value={p.capturedCurrency ?? order.currency} plain />
            <Id label="Capture status" value={p.status} plain />
            <Id label="Webhook verification" value={hook ? `Verified · ${hook.eventId}` : p.webhooks.length ? "No valid signed event yet" : "Not received"} plain />
            <Id label="Verification timestamp" value={p.verification ? <LocalTime iso={p.verification.checkedAt} mode="datetime" /> : "—"} plain />
          </dl>
        </section>
        {p.verification ? (
          <DealVerification report={p.verification} />
        ) : (
          <p className="surface p-5 text-sm text-muted-foreground">Payment checks run after capture. Only a backend-confirmed capture can mark this order as paid.</p>
        )}
      </div>
      <aside className="min-w-0 space-y-6">
        <section className="surface space-y-3 p-5">
          <h2 className="text-sm font-semibold">Payment status</h2>
          <PaymentLifecycle payment={p} />
        </section>
        {simulator && p.captureId && (
          <section className="space-y-3 rounded-2xl border border-dashed p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConicalIcon className="size-4" /> Demo test buttons
            </h2>
            <p className="text-xs text-muted-foreground">Only in demo mode. Try what happens when PayPal sends updates, or when someone sends a fake one.</p>
            <div className="grid gap-2">
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => sim("forge", `/api/orders/${order.id}/simulator/forged-webhook`, {})} data-testid="forge-webhook">
                {busy === "forge" && <Loader2Icon className="animate-spin" />} Send a fake PayPal message
              </Button>
              <Button variant="outline" size="sm" disabled={busy !== null || order.status === "refunded"} onClick={() => sim("refund", `/api/orders/${order.id}/simulator/event`, { kind: "refund" })} data-testid="sim-refund">
                {busy === "refund" && <Loader2Icon className="animate-spin" />} Refund this payment
              </Button>
              <Button variant="outline" size="sm" disabled={busy !== null || order.status === "disputed"} onClick={() => sim("dispute", `/api/orders/${order.id}/simulator/event`, { kind: "dispute" })} data-testid="sim-dispute">
                {busy === "dispute" && <Loader2Icon className="animate-spin" />} Open a dispute
              </Button>
            </div>
          </section>
        )}
        <section className="surface space-y-4 p-5">
          <h2 className="text-sm font-semibold">What happened</h2>
          <OrderTimeline order={order} />
        </section>
      </aside>
    </div>
  );
}

function Id({ label, value, plain }: { label: string; value: React.ReactNode; plain?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={plain ? "font-medium break-words" : "font-mono text-xs break-all"}>{value}</dd>
    </div>
  );
}
