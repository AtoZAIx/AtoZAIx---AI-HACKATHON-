"use client";

import { ArrowRightIcon, CircleHelpIcon, HomeIcon, Loader2Icon, PackageIcon, ReceiptIcon, RotateCcwIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { PaymentOutcome } from "@/lib/nexus/payment-outcome";
import type { NexusOrder } from "@/lib/nexus/types";

const TONE: Record<PaymentOutcome["kind"], { card: string; ring: string; ink: string }> = {
  success: { card: "border-success/30 from-success-soft/80 via-gold-soft/30 to-card", ring: "text-success", ink: "text-success-ink" },
  pending: { card: "border-brand/25 from-brand-soft/80 via-brand-soft/20 to-card", ring: "text-brand", ink: "text-brand-ink" },
  failure: { card: "border-error/30 from-error-soft/80 via-error-soft/20 to-card", ring: "text-error", ink: "text-error-ink" },
  refunded: { card: "border-border from-secondary to-card", ring: "text-muted-foreground", ink: "text-foreground" },
  disputed: { card: "border-warning/40 from-warning-soft/80 to-card", ring: "text-warning", ink: "text-warning-ink" },
};

/** Counts up to the amount, once, when the result appears. */
function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1100);
      setValue(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return run ? value : target;
}

/** The big animated mark: a drawn check, rotating rings, or a drawn cross. */
function ResultMark({ kind, calm }: { kind: PaymentOutcome["kind"]; calm: boolean }) {
  const draw = (delay: number, duration = 0.55) => (calm ? { initial: false as const } : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay, duration, ease: [0.65, 0, 0.35, 1] as const } });
  const tone = TONE[kind];
  return (
    <div className={cn("relative grid size-28 shrink-0 place-items-center", tone.ring)} aria-hidden>
      {/* Soft glow behind the mark. */}
      <motion.span
        className="absolute inset-2 rounded-full bg-current opacity-15 blur-xl"
        animate={calm ? undefined : kind === "pending" ? { scale: [0.9, 1.08, 0.9], opacity: [0.12, 0.25, 0.12] } : { scale: [0.6, 1.1, 1], opacity: [0, 0.3, 0.15] }}
        transition={kind === "pending" ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.9 }}
      />
      {kind === "success" && !calm && (
        <>
          {/* A ring that ripples out once, and a burst of gold sparkles. */}
          <motion.span className="absolute inset-3 rounded-full border-2 border-current" initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ delay: 0.75, duration: 0.9, ease: "easeOut" }} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                className={cn("absolute size-1.5 rounded-full", i % 3 === 0 ? "bg-gold-ink" : i % 3 === 1 ? "bg-success" : "bg-gold")}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{ x: Math.cos(a) * 62, y: Math.sin(a) * 62, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                transition={{ delay: 0.7, duration: 0.9, ease: "easeOut" }}
              />
            );
          })}
        </>
      )}
      <motion.svg
        viewBox="0 0 64 64"
        className="relative size-24"
        animate={!calm && kind === "failure" ? { x: [0, -7, 7, -5, 5, -2, 0] } : undefined}
        transition={!calm && kind === "failure" ? { delay: 0.9, duration: 0.5 } : undefined}
      >
        {kind === "pending" ? (
          <>
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="44 132"
              style={{ originX: "50%", originY: "50%" }}
              animate={calm ? undefined : { rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            />
            <motion.circle
              cx="32"
              cy="32"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.55"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="20 106"
              style={{ originX: "50%", originY: "50%" }}
              animate={calm ? undefined : { rotate: -360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            />
            {/* A small clock in the middle. */}
            <circle cx="32" cy="32" r="9" fill="currentColor" fillOpacity="0.12" />
            <motion.path d="M32 32 V26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ originX: "32px", originY: "32px" }} animate={calm ? undefined : { rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
            <path d="M32 32 L36 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <motion.circle cx="32" cy="32" r="28" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="3" {...draw(0, 0.7)} />
            {kind === "success" && <motion.path d="M20 33 L28.5 41.5 L45 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" {...draw(0.55, 0.45)} />}
            {kind === "failure" && (
              <>
                <motion.path d="M23 23 L41 41" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" {...draw(0.55, 0.25)} />
                <motion.path d="M41 23 L23 41" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" {...draw(0.75, 0.25)} />
              </>
            )}
            {kind === "refunded" && <motion.path d="M22 30 A11 11 0 1 1 25 40 M22 30 V22 M22 30 H30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" {...draw(0.55)} />}
            {kind === "disputed" && (
              <>
                <motion.path d="M32 20 V36" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" {...draw(0.55, 0.3)} />
                <motion.circle cx="32" cy="44" r="2.6" fill="currentColor" initial={calm ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9 }} />
              </>
            )}
          </>
        )}
      </motion.svg>
    </div>
  );
}

/** Pending: what's done, what PayPal is doing now, and what comes next. */
function PendingSteps({ order, outcome, calm }: { order: NexusOrder; outcome: PaymentOutcome; calm: boolean }) {
  const held = order.payment?.status === "PENDING";
  const capturing = order.status === "payment_pending";
  const steps = [
    { label: "You approved on PayPal", state: "done" as const },
    { label: capturing ? "Taking the payment" : held ? "PayPal is reviewing the payment" : "Waiting for PayPal’s signed confirmation", state: "now" as const },
    { label: "Order confirmed", state: "next" as const },
  ];
  return (
    <ol className="space-y-2" aria-label="Payment progress" data-testid="pending-steps">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-2.5 text-sm">
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-[11px] font-semibold",
              s.state === "done" ? "bg-success text-white" : s.state === "now" ? "bg-brand text-white" : "border-2 border-dashed border-border text-muted-foreground",
            )}
          >
            {s.state === "done" ? "✓" : s.state === "now" ? <Loader2Icon className={cn("size-3.5", !calm && "animate-spin")} /> : "3"}
          </span>
          <span className={cn(s.state === "next" && "text-muted-foreground", s.state === "now" && "font-medium")}>
            {s.label}
            {s.state === "now" && !calm && (
              <span className="ml-0.5 inline-flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="inline-block" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}>
                    .
                  </motion.span>
                ))}
              </span>
            )}
          </span>
        </li>
      ))}
      {outcome.reason && <li className="pl-8 text-xs text-muted-foreground">{outcome.reason}</li>}
    </ol>
  );
}

/**
 * The page after paying: success, pending or failure (and refunded or
 * disputed later), with the next step for each. Driven only by the order's
 * server-side state, so it can never show "paid" before PayPal confirms.
 */
export function PaymentResult({
  order,
  outcome,
  simulator,
  onOrder,
}: {
  order: NexusOrder;
  outcome: PaymentOutcome;
  /** Demo mode: show buttons that play PayPal finishing a review. */
  simulator: boolean;
  onOrder: (o: NexusOrder) => void;
}) {
  const reduced = useReducedMotion();
  const calm = Boolean(reduced);
  const [busy, setBusy] = useState<string | null>(null);
  const merchant = MERCHANT_DIRECTORY[order.merchantId];
  const paid = order.payment?.capturedAmountCents ?? order.totalCents;
  const amount = useCountUp(paid, outcome.kind === "success" && !calm);
  const tone = TONE[outcome.kind];

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  const retry = () =>
    act("retry", async () => {
      const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}/retry`, { method: "POST" });
      onOrder(data.order);
      toast.success(data.order.status === "awaiting_approval" ? "Approve the deal again, then pay." : "Ready to pay again.");
    });
  const settle = (kind: "review-complete" | "review-deny") =>
    act(kind, async () => {
      const data = await api<{ order: NexusOrder }>(`/api/orders/${order.id}/simulator/event`, { json: { kind } });
      onOrder(data.order);
    });

  return (
    <motion.section
      initial={calm ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn("relative overflow-hidden rounded-[27px] border bg-gradient-to-br p-6 shadow-raised sm:p-8", tone.card)}
      role="status"
      aria-live="polite"
      aria-labelledby="payment-result-title"
      data-testid="payment-result"
      data-kind={outcome.kind}
    >
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left" {...(outcome.kind === "success" ? { "data-testid": "order-confirmed" } : {})}>
        <ResultMark kind={outcome.kind} calm={calm} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className={cn("text-[11px] font-semibold tracking-[0.18em] uppercase", tone.ink)}>
              {outcome.kind === "success" ? "Paid with PayPal" : outcome.kind === "pending" ? "In progress" : outcome.kind === "failure" ? "Not completed" : outcome.kind === "refunded" ? "Refunded" : "Needs attention"}
            </p>
            <motion.h2
              id="payment-result-title"
              className="font-display text-3xl leading-tight sm:text-4xl"
              initial={calm ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              {outcome.title}
            </motion.h2>
            <p className="text-sm text-muted-foreground">{outcome.message}</p>
          </div>

          {outcome.kind === "success" && (
            <div className="space-y-2">
              <p className="tabular text-4xl font-semibold" data-testid="result-amount">
                {formatMoney(amount)} <span className="text-base font-medium text-muted-foreground">{order.currency}</span>
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-xs text-muted-foreground">Paid to</dt>
                  <dd className="font-medium">{merchant.name}</dd>
                </div>
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-xs text-muted-foreground">Order number</dt>
                  <dd className="font-mono text-xs">{order.id}</dd>
                </div>
                {order.booking && (
                  <div className="flex justify-between gap-3 sm:col-span-2 sm:block">
                    <dt className="text-xs text-muted-foreground">Still to pay the seller later</dt>
                    <dd className="tabular font-medium">{formatMoney(order.booking.balanceDueCents)}, outside this app</dd>
                  </div>
                )}
              </dl>
              <p className="flex items-center justify-center gap-1.5 text-xs text-success-ink sm:justify-start">
                <ShieldCheckIcon className="size-3.5" aria-hidden /> Checked with PayPal: the right amount went to the right store.
              </p>
            </div>
          )}

          {outcome.kind === "pending" && <PendingSteps order={order} outcome={outcome} calm={calm} />}

          {(outcome.kind === "failure" || outcome.kind === "disputed") && outcome.reason && (
            <p className={cn("rounded-xl bg-background/70 px-3 py-2 text-sm", tone.ink)} data-testid="result-reason">
              {outcome.reason}
            </p>
          )}
          {outcome.kind === "failure" && !outcome.charged && (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium">
              <ShieldCheckIcon className="size-3.5 text-success" aria-hidden /> You weren’t charged
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            {outcome.kind === "success" && (
              <>
                <Button asChild>
                  <Link href={`/payments/${order.id}`}>
                    <ReceiptIcon /> See payment details <ArrowRightIcon />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/orders">
                    <PackageIcon /> Your orders
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/">
                    <HomeIcon /> Home
                  </Link>
                </Button>
              </>
            )}
            {outcome.kind === "pending" && simulator && order.payment?.status === "PENDING" && (
              <>
                <Button size="sm" onClick={() => settle("review-complete")} disabled={busy !== null} data-testid="sim-review-complete">
                  {busy === "review-complete" && <Loader2Icon className="animate-spin" />} Demo: PayPal approves the review
                </Button>
                <Button size="sm" variant="outline" onClick={() => settle("review-deny")} disabled={busy !== null} data-testid="sim-review-deny">
                  {busy === "review-deny" && <Loader2Icon className="animate-spin" />} Demo: PayPal declines it
                </Button>
              </>
            )}
            {outcome.kind === "pending" && <p className="w-full text-xs text-muted-foreground">This page updates by itself. You can leave and come back.</p>}
            {outcome.kind === "failure" && outcome.retry === "new-payment" && (
              <Button onClick={retry} disabled={busy !== null} data-testid="retry-payment">
                {busy === "retry" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Try again
              </Button>
            )}
            {outcome.kind === "failure" && outcome.retry === "checkout" && (
              <Button onClick={() => document.getElementById("pay-title")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" })} data-testid="retry-checkout">
                <RotateCcwIcon /> Try again below
              </Button>
            )}
            {(outcome.kind === "failure" || outcome.kind === "disputed" || outcome.kind === "refunded") && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/payments/${order.id}`}>
                    {outcome.kind === "failure" && !outcome.retry ? <ShieldAlertIcon /> : <ReceiptIcon />} View details
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={outcome.retry ? "/help" : `/negotiations/${order.sessionId}`}>
                    <CircleHelpIcon /> {outcome.retry ? "Get help" : "Back to your deal"}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
