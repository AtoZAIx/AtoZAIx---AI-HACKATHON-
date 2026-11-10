"use client";

import { UsersRoundIcon } from "lucide-react";
import { useState } from "react";
import type { MoneyPlan } from "@/lib/nexus/budget";
import { emergencyMonthsFor, emergencyRate } from "@/lib/nexus/household";
import { POLICY_LINE, type BuildPot, type ThreePriorities } from "@/lib/nexus/savings-policy";
import { useFmt } from "./currency";

/** Validated categorical hues (dataviz validator, light surface). */
export const PRIORITY_COLOR = { live: "var(--chart-2)", enjoy: "var(--chart-4)", build: "var(--chart-1)", unassigned: "#a1a1aa" } as const;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");

type Slice = { key: keyof typeof PRIORITY_COLOR; label: string; sub: string; cents: number };

/** What each part means, in plain words; shown under its name. */
const MEANING: Record<Slice["key"], { what: string; empty: string }> = {
  live: { what: "Must-pay costs: rent, food, bills, medical, EMIs, school", empty: "Add your monthly costs to see this" },
  enjoy: { what: "Eating out, shopping, fun and travel", empty: "Nothing left to spend on yourself yet" },
  build: { what: "Emergency fund, goals and future savings", empty: "Nothing left to save yet" },
  unassigned: { what: "Left over: you choose to save or spend it", empty: "" },
};

/**
 * LIVE · ENJOY · BUILD as a donut: where every rupee goes, at a glance.
 * Hover or focus a slice (or its legend row) to read it; the centre shows the savings rate.
 */
export function PriorityDonut({ p }: { p: ThreePriorities }) {
  const formatMoney = useFmt();
  const [active, setActive] = useState<Slice["key"] | null>(null);
  const slices: Slice[] = [
    { key: "live", label: "LIVE", sub: "Essentials", cents: p.live },
    { key: "enjoy", label: "ENJOY", sub: "On yourself", cents: p.enjoy },
    { key: "build", label: "BUILD", sub: "Savings", cents: p.build },
    ...(p.unassigned > 0 ? [{ key: "unassigned", label: "FREE", sub: "Not assigned yet", cents: p.unassigned } as Slice] : []),
  ];
  const whole = Math.max(1, slices.reduce((t, x) => t + x.cents, 0));
  const R = 64;
  const C = 2 * Math.PI * R;
  const shown = slices.filter((x) => x.cents > 0);
  const gap = shown.length > 1 ? 2.5 : 0; // 2px surface gap between slices
  let offset = 0;
  const focus = slices.find((x) => x.key === active);
  const summary = slices.map((x) => `${x.label} ${pct(x.cents, p.income)} (${formatMoney(x.cents)})`).join(", ");

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]" data-testid="priority-bar">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 168 168" className="size-full -rotate-90" role="img" aria-label={`Where your income goes: ${summary}.`}>
          <circle cx="84" cy="84" r={R} fill="none" stroke="var(--secondary)" strokeWidth="24" />
          {shown.map((x) => {
            const len = (x.cents / whole) * C;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={x.key}
                cx="84"
                cy="84"
                r={R}
                fill="none"
                stroke={PRIORITY_COLOR[x.key]}
                strokeWidth={active === x.key ? 28 : 24}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                className="cursor-pointer transition-all duration-300"
                style={{ opacity: active && active !== x.key ? 0.3 : 1 }}
                onMouseEnter={() => setActive(x.key)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${x.label} · ${x.sub}: ${formatMoney(x.cents)} (${pct(x.cents, p.income)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
          {focus ? (
            <>
              <span className="text-[11px] font-semibold tracking-wide">{focus.label}</span>
              <span className="font-display text-3xl leading-none">{pct(focus.cents, p.income)}</span>
              <span className="tabular text-[11px] text-muted-foreground">{formatMoney(focus.cents)}</span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">You save</span>
              <span className="font-display text-4xl leading-none">{Math.round(p.rate * 100)}%</span>
              <span className="text-[11px] text-muted-foreground">of income</span>
            </>
          )}
        </div>
      </div>
      <ul className="space-y-1.5">
        {slices.map((x) => (
          <li
            key={x.key}
            tabIndex={0}
            onMouseEnter={() => setActive(x.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(x.key)}
            onBlur={() => setActive(null)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active === x.key ? "bg-secondary" : "bg-background/60"}`}
            data-testid={`priority-${x.key}`}
          >
            <span className="size-3 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[x.key] }} aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold tracking-wide">{x.label}</span> <span className="text-muted-foreground">{x.sub}</span>
              <span className={`block text-[11px] ${x.cents === 0 && MEANING[x.key].empty ? "font-medium text-warning-ink" : "text-muted-foreground"}`} data-testid={`priority-${x.key}-meaning`}>
                {x.cents === 0 && MEANING[x.key].empty ? MEANING[x.key].empty : MEANING[x.key].what}
              </span>
            </span>
            <span className="tabular text-right">
              <span className="block text-sm font-semibold">{formatMoney(x.cents)}</span>
              <span className="block text-[11px] text-muted-foreground">{pct(x.cents, p.income)} of income</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How the family shapes the plan, in plain words. */
export function FamilyNotes({ plan, enjoy }: { plan: MoneyPlan; enjoy: number }) {
  const formatMoney = useFmt();
  const pr = plan.profile;
  const kids = pr?.children ?? 0;
  // Older plans have no stored size: count it from what they do have.
  const size = Math.max(1, pr?.householdSize ?? kids + (pr?.maritalStatus === "married" ? 2 : 1) + (pr?.supportsParents ? 2 : 0));
  const adults = Math.max(1, size - kids);
  const months = plan.emergency?.targetMonths ?? emergencyMonthsFor(size, kids);
  return (
    <div className="space-y-1.5 rounded-xl border border-gold/30 bg-gold-soft/40 p-3 text-xs" data-testid="family-notes">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <UsersRoundIcon className="size-4 text-gold-ink" aria-hidden />
        {size === 1 ? "Just you" : `Family of ${size}`}
        <span className="font-normal text-muted-foreground">
          · {adults} adult{adults === 1 ? "" : "s"}
          {kids > 0 ? `, ${kids} child${kids === 1 ? "" : "ren"}` : ""}
        </span>
      </p>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          Emergency fund: <b className="text-foreground">{months} months</b> of essentials, at least <b className="text-foreground">{Math.round(emergencyRate(size) * 100)}%</b> of income a month.
        </li>
        {kids > 0 && (
          <li>
            Children’s education: <b className="text-foreground">15%</b> of extra savings per child.
          </li>
        )}
        {size > 1 && (
          <li>
            About <b className="tabular text-foreground">{formatMoney(Math.floor(enjoy / size / 100) * 100)}</b> a person each month to enjoy.
          </li>
        )}
      </ul>
    </div>
  );
}

const STATUS_WORD = { preferred: "On target", fallback: "Good", below: "Below 30%", none: "Not saving yet", shortfall: "Essentials above income" } as const;
const STATUS_CLS = {
  preferred: "bg-success-soft text-success-ink",
  fallback: "bg-brand-soft text-brand-ink",
  below: "bg-secondary text-foreground",
  none: "bg-secondary text-foreground",
  shortfall: "bg-error-soft text-error-ink",
} as const;

/** The savings rate, the policy, and why the result is what it is. */
export function SavingsRate({ p }: { p: ThreePriorities }) {
  const formatMoney = useFmt();
  return (
    <div className="space-y-1.5" data-testid="savings-rate">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          You save <b className="tabular">{Math.round(p.rate * 100)}%</b> · {formatMoney(p.build)} a month · {formatMoney(p.build * 12)} a year
        </span>
        {/* Without rent and EMIs the rate isn't real yet: say so rather than "On target". */}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.live === 0 ? "bg-secondary text-foreground" : STATUS_CLS[p.status]}`}>{p.live === 0 ? "Not final yet" : STATUS_WORD[p.status]}</span>
      </p>
      {p.live > 0 && p.status !== "preferred" && <p className="text-xs text-muted-foreground">{p.explanation}</p>}
      <p className="text-[11px] text-muted-foreground">{POLICY_LINE}</p>
    </div>
  );
}

/** BUILD, split into separate virtual pots. */
export function BuildPots({ pots, testId }: { pots: BuildPot[]; testId?: string }) {
  const formatMoney = useFmt();
  return (
    <ul className="space-y-1 text-sm" data-testid={testId}>
      {pots.map((x) => (
        <li key={x.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
          <span>{x.label}</span>
          <b className="tabular">{formatMoney(x.cents)}</b>
        </li>
      ))}
    </ul>
  );
}
