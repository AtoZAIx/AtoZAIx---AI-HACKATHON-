"use client";

import { PayPalGuestPaymentButton, PayPalOneTimePaymentButton, PayPalProvider, usePayPal } from "@paypal/react-paypal-js/sdk-v6";
import { CheckIcon, CreditCardIcon, FlaskConicalIcon, Loader2Icon, WalletIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PAYMENT_STATE, StatusBadge } from "@/components/nexus/common/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/nexus/client";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { NexusOrder } from "@/lib/nexus/types";
import { TestCardForm } from "./test-card-form";

export interface PaymentsConfig {
  provider: "paypal-sandbox" | "simulated";
  clientId: string | null;
  environment: "sandbox";
  webhookRequired: boolean;
}

/**
 * Payment step. The server creates the PayPal order for the approved amount;
 * the browser only collects buyer approval. Capture and every verification
 * happen server-side, and success is shown only once the backend confirms.
 */
export function PayPalCheckout({ order, payments, onOrder }: { order: NexusOrder; payments: PaymentsConfig; onOrder: (o: NexusOrder) => void }) {
  const [simOrderId, setSimOrderId] = useState<string | null>(null);
  const [method, setMethod] = useState<"paypal" | "card" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];
  const latest = order.payment?.lifecycle.at(-1);
  const capturing = order.status === "payment_captured";

  const [riskAsk, setRiskAsk] = useState<string | null>(null);
  const create = async (confirmRisk = false) => {
    try {
      const data = await api<{ order: NexusOrder; paypalOrderId: string }>(`/api/orders/${order.id}/pay`, { json: confirmRisk ? { confirmRisk: true } : {} });
      onOrder(data.order);
      return data.paypalOrderId;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 428 || err.status === 403)) {
        // Refresh so the fraud check and its reasons show on the page.
        const fresh = await api<{ order: NexusOrder }>(`/api/orders/${order.id}`).catch(() => null);
        if (fresh) onOrder(fresh.order);
        if (err.status === 428) setRiskAsk(err.message);
      }
      throw err;
    }
  };
  /** Reuse the open PayPal order if there is one, so card retries keep their history. */
  const ensureOrder = async () => (order.status === "payment_pending" && order.payment?.paypalOrderId ? order.payment.paypalOrderId : create());
  const capture = async (id: string) => {
    // Same key for the same PayPal order: double clicks or retries can never capture twice.
    const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}/capture`, { json: { paypalOrderId: id }, headers: { "Idempotency-Key": `capture-${id}` } });
    onOrder(data.order);
    if (data.order.status === "confirmed") toast.success("Payment verified. Order confirmed.");
    else if (data.order.status === "payment_failed") toast.error("Payment verification failed");
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment step failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="surface space-y-5 p-5" aria-labelledby="pay-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="pay-title" className="text-lg font-semibold">
            Pay
          </h2>
          <p className="text-sm text-muted-foreground">You approved the price. Choose how to pay.</p>
        </div>
        {payments.provider === "simulated" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
            <FlaskConicalIcon className="size-3.5" /> Simulator · no money moves
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
            <WalletIcon className="size-3.5" /> PayPal Sandbox
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Amount" value={`${formatMoney(order.totalCents)} ${order.currency}`} strong />
        <Info label="Merchant" value={merchant.name} />
        <Info label="Payment status" value={latest ? PAYMENT_STATE[latest.state].label : "Not started"} />
        <Info label="Reference" value={order.payment?.paypalOrderId ?? "Created when you continue"} mono />
      </dl>

      {capturing ? (
        <div className="flex items-center gap-3 rounded-xl bg-brand-soft/60 p-3 text-sm" role="status">
          <Loader2Icon className="size-4 animate-spin text-brand-ink" />
          Capture received. Waiting for the signed PayPal webhook before confirming your order.
        </div>
      ) : payments.provider === "paypal-sandbox" && payments.clientId ? (
        <PayPalProvider clientId={payments.clientId} environment="sandbox" components={["paypal-payments", "paypal-guest-payments"]} pageType="checkout">
          <SandboxButtons
            createOrder={create}
            onApprove={(id) => run("capture", () => capture(id))}
            onCancel={() => toast.message("Payment cancelled. Nothing was charged.")}
            onError={(m) => toast.error(m)}
          />
        </PayPalProvider>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              variant={method === "card" ? "outline" : "default"}
              onClick={() =>
                run("pay", async () => {
                  setMethod("paypal");
                  setSimOrderId(await ensureOrder());
                })
              }
              disabled={busy !== null}
              data-testid="pay-simulated"
            >
              {busy === "pay" ? <Loader2Icon className="animate-spin" /> : <WalletIcon />} Pay with PayPal
            </Button>
            <Button size="lg" variant={method === "card" ? "default" : "outline"} onClick={() => setMethod("card")} disabled={busy !== null} data-testid="pay-card">
              <CreditCardIcon /> Pay with debit or credit card
            </Button>
          </div>
          {method === "card" && <TestCardForm order={order} ensureOrder={ensureOrder} onOrder={onOrder} />}
          <p className="text-xs text-muted-foreground">Demo mode: PayPal isn’t connected yet, so a safe simulator stands in. No real money moves.</p>
        </div>
      )}

      <Dialog open={simOrderId !== null} onOpenChange={(open) => !open && busy === null && setSimOrderId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment simulator</DialogTitle>
            <DialogDescription>Stands in for the buyer approving on PayPal when no sandbox credentials are set. No real account or money is involved.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-xl bg-secondary p-3 text-sm">
            <Row label="Pay to" value={merchant.name} />
            <Row label="Amount" value={`${formatMoney(order.totalCents)} ${order.currency}`} />
            <Row label="Order" value={simOrderId ?? ""} mono />
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOrderId(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                run("approve", async () => {
                  if (!simOrderId) return;
                  await api(`/api/orders/${order.id}/simulator/approve`, { json: { paypalOrderId: simOrderId } });
                  await capture(simOrderId);
                  setSimOrderId(null);
                })
              }
              disabled={busy !== null}
              data-testid="sim-approve"
            >
              {busy === "approve" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {order.risk && <RiskLine risk={order.risk} confirmed={Boolean(order.riskConfirmedAt)} />}
      <Dialog open={riskAsk !== null} onOpenChange={(open) => !open && setRiskAsk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Is this payment yours?</DialogTitle>
            <DialogDescription>Our fraud check noticed something unusual about this payment. Nothing has been charged.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(order.risk?.signals ?? []).map((s) => (
              <li key={s.id}>
                <b>{s.label}.</b> {s.detail}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskAsk(null)}>
              No, stop
            </Button>
            <Button
              data-testid="confirm-risk"
              onClick={() =>
                run("confirm", async () => {
                  await create(true);
                  setRiskAsk(null);
                  toast.success("Thanks for confirming. Choose how to pay to continue.");
                })
              }
              disabled={busy !== null}
            >
              Yes, it’s me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {latest && <StatusBadge tone={PAYMENT_STATE[latest.state].tone} label={`Latest: ${PAYMENT_STATE[latest.state].label}`} />}
    </section>
  );
}

function SandboxButtons({
  createOrder,
  onApprove,
  onCancel,
  onError,
}: {
  createOrder: () => Promise<string>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { loadingStatus, error } = usePayPal();
  const status = String(loadingStatus).toLowerCase();
  if (status === "rejected") return <p className="text-sm text-error-ink">PayPal SDK failed to load: {error?.message ?? "unknown error"}</p>;
  if (status === "pending")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading PayPal…
      </p>
    );
  const approve = async (data: { orderId?: string }) => {
    if (!data.orderId) throw new Error("PayPal did not return an order id");
    await onApprove(data.orderId);
  };
  return (
    <div className="space-y-3">
      <PayPalOneTimePaymentButton
        type="pay"
        presentationMode="auto"
        createOrder={async () => ({ orderId: await createOrder() })}
        onApprove={approve}
        onCancel={() => onCancel()}
        onError={(e: unknown) => onError(e instanceof Error ? e.message : "PayPal checkout error")}
      />
      {/* Debit or credit card without a PayPal account (guest checkout). In Sandbox, use PayPal's card generator. */}
      <PayPalGuestPaymentButton
        createOrder={async () => ({ orderId: await createOrder() })}
        onApprove={approve}
        onCancel={() => onCancel()}
        onError={(e: unknown) => onError(e instanceof Error ? e.message : "Card checkout error")}
      />
      <p className="text-xs text-muted-foreground">Sandbox: test cards come from PayPal’s Sandbox card generator, not the Payflow test card list.</p>
    </div>
  );
}

function RiskLine({ risk, confirmed }: { risk: NonNullable<NexusOrder["risk"]>; confirmed: boolean }) {
  const tone = risk.level === "high" ? "text-error-ink" : risk.level === "medium" ? "text-warning-ink" : "text-success-ink";
  const word = risk.level === "high" ? "Blocked" : risk.level === "medium" ? (confirmed ? "Confirmed by you" : "Needs your confirmation") : "Low risk";
  return (
    <details className="rounded-xl border px-3 py-2 text-sm" data-testid="risk-line">
      <summary className="cursor-pointer">
        <span className="text-muted-foreground">Fraud check: </span>
        <span className={`font-medium ${tone}`}>{word}</span>
        <span className="tabular text-muted-foreground"> · score {risk.score}/100</span>
      </summary>
      {risk.signals.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {risk.signals.map((s) => (
            <li key={s.id}>
              +{s.points} {s.label}: {s.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No warning signs: normal amount, pace and payment history.</p>
      )}
    </details>
  );
}

function Info({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-xs" : ""} ${strong ? "tabular text-base font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "font-medium"}>{value}</dd>
    </div>
  );
}
