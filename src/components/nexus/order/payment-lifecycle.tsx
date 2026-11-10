import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { PAYMENT_STATE } from "@/components/nexus/common/status-badge";
import type { PaymentRecord, PaymentState } from "@/lib/nexus/types";
import { LocalTime } from "@/components/nexus/common/local-time";

const HAPPY: PaymentState[] = ["created", "awaiting_approval", "approved", "capturing", "captured"];

/** Payment lifecycle as observed by the backend: created → captured, plus terminal states. */
export function PaymentLifecycle({ payment }: { payment: PaymentRecord | null }) {
  const seen = new Map((payment?.lifecycle ?? []).map((e) => [e.state, e]));
  const terminal = (payment?.lifecycle ?? []).filter((e) => e.state === "failed" || e.state === "refunded" || e.state === "disputed");
  return (
    <ol className="space-y-2" aria-label="Payment lifecycle">
      {HAPPY.map((s) => {
        const e = seen.get(s);
        return (
          <li key={s} className="flex items-center gap-3 text-sm">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", e ? "border-success bg-success text-white" : "text-muted-foreground")}>
              {e && <CheckIcon className="size-3" />}
            </span>
            <span className={cn("flex-1", !e && "text-muted-foreground")}>{PAYMENT_STATE[s].label}</span>
            {e && <time className="tabular text-[11px] text-muted-foreground"><LocalTime iso={e.at} mode="time-s" /></time>}
          </li>
        );
      })}
      {terminal.map((e) => (
        <li key={`${e.state}-${e.at}`} className="flex items-center gap-3 text-sm">
          <span className={cn("size-5 shrink-0 rounded-full", e.state === "refunded" ? "bg-foreground/60" : "bg-error")} aria-hidden />
          <span className="flex-1 font-medium">{PAYMENT_STATE[e.state].label}</span>
          <time className="tabular text-[11px] text-muted-foreground"><LocalTime iso={e.at} mode="time-s" /></time>
        </li>
      ))}
    </ol>
  );
}
