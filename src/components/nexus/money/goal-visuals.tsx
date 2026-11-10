"use client";

import { BikeIcon, CarIcon, LockIcon, GraduationCapIcon, HeartIcon, HomeIcon, LaptopIcon, PlaneIcon, ShieldCheckIcon, TargetIcon, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";

/**
 * Small, decorative motion for savings goals. Every number is also written out
 * as text next to it, so nothing depends on the animation; and everything
 * settles instantly for people who ask for reduced motion (see globals.css).
 */

/** Starts at 0 and moves to the real value after the first paint, so bars and rings "fill up". */
function useGrow(value: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return shown;
}

const ICONS: Array<[RegExp, LucideIcon]> = [
  [/house|home|flat|apartment/i, HomeIcon],
  [/car|vehicle/i, CarIcon],
  [/bike|scooter|motorcycle/i, BikeIcon],
  [/educat|school|college|course|study/i, GraduationCapIcon],
  [/wedding|marriage/i, HeartIcon],
  [/holiday|trip|travel|vacation/i, PlaneIcon],
  [/phone|laptop|macbook|iphone|gadget|tablet|camera|tv/i, LaptopIcon],
  [/emergenc|safety/i, ShieldCheckIcon],
];

/** A goal's icon in a gold tile, picked from its name. */
export function GoalIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS.find(([re]) => re.test(name))?.[1] ?? TargetIcon;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gradient-to-br from-gold-soft to-white text-gold-ink shadow-[inset_0_1px_0_white]", className)} aria-hidden>
      <Icon className="size-5" />
    </span>
  );
}

/** Animated progress ring with the percentage in the middle. */
export function ProgressRing({ value, size = 64, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const shown = useGrow(v);
  const stroke = Math.max(5, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = v >= 1;
  return (
    <span className={cn("relative inline-flex shrink-0", done && "goal-done", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--secondary)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? "var(--success)" : "var(--chart-1)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-lg leading-none">{Math.round(v * 100)}%</span>
      </span>
    </span>
  );
}

/** A progress bar that fills on arrival, with a slow gold shimmer and milestone ticks at 25/50/75%. */
export function ShimmerBar({ value, label, done, className }: { value: number; label: string; done?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const shown = useGrow(v);
  return (
    <div
      className={cn("relative h-2.5 overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div
        className={cn("shimmer-fill h-full rounded-full", done && "is-done")}
        style={{ width: `${shown * 100}%`, transition: "width 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
      {[0.25, 0.5, 0.75].map((m) => (
        <span key={m} className={cn("absolute top-0 h-full w-px", v >= m ? "bg-white/70" : "bg-border")} style={{ left: `${m * 100}%` }} aria-hidden />
      ))}
    </div>
  );
}

/**
 * The lock-in as a journey: start → today → maturity, with a pulsing
 * "you are here" marker and a dot for each year.
 */
export function LockTimeline({ step, months, startLabel, endLabel }: { step: number; months: number; startLabel: string; endLabel: string }) {
  const v = months > 0 ? Math.max(0, Math.min(1, (step - 0.5) / months)) : 0;
  const shown = useGrow(v);
  const years = Math.floor(months / 12);
  return (
    <div className="space-y-1.5" data-testid="lock-timeline">
      <div className="relative h-6" aria-hidden>
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-secondary" />
        <div className="shimmer-fill absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full" style={{ width: `${shown * 100}%`, transition: "width 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }} />
        {Array.from({ length: Math.max(0, years - 1) }, (_, i) => (i + 1) * 12).map((m) => (
          <span key={m} className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", step >= m ? "bg-gold" : "bg-border")} style={{ left: `${(m / months) * 100}%` }} />
        ))}
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${shown * 100}%`, transition: "left 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <span className="timeline-pulse block size-3.5 rounded-full border-2 border-white bg-gold-ink shadow" />
        </span>
        <span className="absolute top-1/2 right-0 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border border-gold/50 bg-gold-soft text-gold-ink">
          <LockIcon className="size-3" />
        </span>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{startLabel}</span>
        <span className="font-medium text-foreground">
          Month {step} of {months}
        </span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
