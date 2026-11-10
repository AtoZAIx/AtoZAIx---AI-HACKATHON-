import { cn } from "cn";
import type { CheckStatus, OrderStatus, PaymentState, SessionStatus } from "@/lib/nexus/types";

export type Tone = "success" | "warning" | "error" | "brand" | "neutral" | "info";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-soft text-success-ink", dot: "bg-success" },
  warning: { pill: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
  error: { pill: "bg-error-soft text-error-ink", dot: "bg-error" },
  brand: { pill: "bg-brand-soft text-brand-ink", dot: "bg-brand" },
  info: { pill: "bg-secondary text-foreground", dot: "bg-foreground/60" },
  neutral: { pill: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground/60" },
};

/** Pill with a status dot. Colour always comes with a text label. */
export function StatusBadge({ tone, label, className, pulse }: { tone: Tone; label: string; className?: string; pulse?: boolean }) {
  const t = TONE[tone];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", t.pill, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot, pulse && "animate-pulse")} aria-hidden />
      {label}
    </span>
  );
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  awaiting_approval: { label: "Needs your approval", tone: "warning" },
  approved: { label: "Approved, ready to pay", tone: "brand" },
  payment_pending: { label: "Paying", tone: "brand" },
  payment_captured: { label: "Confirming payment", tone: "brand" },
  confirmed: { label: "Paid", tone: "success" },
  payment_failed: { label: "Payment failed", tone: "error" },
  refunded: { label: "Refunded", tone: "info" },
  disputed: { label: "Disputed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone }> = {
  intake: { label: "Getting started", tone: "neutral" },
  negotiating: { label: "Getting prices", tone: "brand" },
  negotiated: { label: "Offers ready", tone: "brand" },
  agreed: { label: "Deal chosen", tone: "success" },
  ordered: { label: "Deal chosen", tone: "success" },
  failed: { label: "Stopped", tone: "error" },
};

export const CHECK_STATUS: Record<CheckStatus, { label: string; tone: Tone }> = {
  pass: { label: "Passed", tone: "success" },
  fail: { label: "Failed", tone: "error" },
  unknown: { label: "Unknown", tone: "warning" },
};

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: Tone }> = {
  created: { label: "Created", tone: "neutral" },
  awaiting_approval: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "brand" },
  capturing: { label: "Capturing", tone: "brand" },
  captured: { label: "Captured", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  refunded: { label: "Refunded", tone: "info" },
  disputed: { label: "Disputed", tone: "error" },
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return <StatusBadge tone={s.tone} label={s.label} className={className} />;
}

export function SessionStatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  const s = SESSION_STATUS[status];
  return <StatusBadge tone={s.tone} label={s.label} className={className} pulse={status === "negotiating"} />;
}
