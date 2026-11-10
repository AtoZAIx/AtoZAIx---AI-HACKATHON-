"use client";

import { Building2Icon, LockIcon, ReceiptIcon, RepeatIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { goalSaved, type MoneyPlan, type MonthPlan } from "@/lib/nexus/budget";
import { autoSaveOf, nextAutoPay, setAutoPay, setAutoSave } from "@/lib/nexus/household";
import { nextDebit } from "@/lib/nexus/mandate";
import { useFmt } from "./currency";
import type { UpdatePlan } from "./money-planner";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Opens a goal's auto-debit setup and scrolls to it. */
export function openMandateSetup(goalId: string) {
  window.dispatchEvent(new CustomEvent("nexus:open-mandate", { detail: { goalId } }));
}

/**
 * Everything that runs by itself each month, in one place: bill auto-pay
 * (rent, EMIs), auto-save for locked funds, and auto-debit (simulated).
 */
export function AutoPayments({ plan, month, update, today }: { plan: MoneyPlan; month: MonthPlan; update: UpdatePlan; today: string }) {
  const formatMoney = useFmt();
  const bills = plan.bills.filter((b) => (b.kind ?? "need") === "need" && b.amountCents > 0);
  const funds = plan.goals.filter((g) => g.lockMonths && !g.withdrawal && g.targetCents - goalSaved(g) > 0);
  if (!bills.length && !funds.length) return null;
  const now = today.slice(0, 7);
  const planned = (id: string) => month.goals.find((g) => g.goal.id === id)?.monthlyCents ?? 0;
  const total =
    bills.filter((b) => b.autoPay).reduce((t, b) => t + b.amountCents, 0) +
    funds.reduce((t, g) => t + (g.mandate?.status === "active" ? g.mandate.amountCents : autoSaveOf(g) ? planned(g.id) : 0), 0);

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="autopay-title" data-testid="auto-payments">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="autopay-title" className="flex items-center gap-2 text-[15px] font-semibold">
            <RepeatIcon className="size-4 text-gold-ink" aria-hidden /> Automatic payments
          </h2>
          <p className="text-xs text-muted-foreground">Everything that runs by itself each month. Auto-pay and auto-save are recorded in your plan; auto-debit is simulated. No money moves from your bank.</p>
        </div>
        <p className="tabular text-sm" data-testid="auto-total">
          <b>{formatMoney(total)}</b> <span className="text-muted-foreground">a month runs automatically</span>
        </p>
      </div>

      <ul className="divide-y rounded-xl border">
        {bills.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm" data-testid={`auto-row-${b.name}`}>
            <ReceiptIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{b.name}</span> <span className="tabular text-muted-foreground">· {formatMoney(b.amountCents)}</span>
              <span className="block text-[11px] text-muted-foreground">
                {b.autoPay
                  ? `Auto-pay on the ${ordinal(b.autoPay.day)} · ${b.autoPay.lastMonth === now ? "paid this month" : `next ${shortDate(nextAutoPay(b.autoPay.day, today, b.autoPay.lastMonth))}`}`
                  : "Off: log it yourself when you pay"}
              </span>
            </span>
            <Toggle label={`Auto-pay ${b.name}`} on={Boolean(b.autoPay)} onChange={(on) => update((p) => setAutoPay(p, b.id, on ? (b.autoPay?.day ?? 1) : null))} />
            {b.autoPay && <DaySelect label={`${b.name} auto-pay day`} day={b.autoPay.day} onChange={(d) => update((p) => setAutoPay(p, b.id, d))} />}
          </li>
        ))}
        {funds.map((g) => {
          const m = g.mandate?.status === "active" ? g.mandate : null;
          const a = autoSaveOf(g);
          const nd = m ? nextDebit(g, today) : null;
          return (
            <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm" data-testid={`auto-row-${g.name}`}>
              <LockIcon className="size-4 shrink-0 text-gold-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{g.name}</span> <span className="text-muted-foreground">· locked fund</span>
                <span className="block text-[11px] text-muted-foreground">
                  {m
                    ? `Auto-debit ${formatMoney(m.amountCents)} on the ${ordinal(m.day)} (simulated) · ${nd ? `next ${shortDate(nd.date)}` : "no more debits due"}`
                    : a
                      ? `Auto-save ${formatMoney(planned(g.id))} on the ${ordinal(a.day)} · ${a.lastMonth === now ? "saved this month" : `next ${shortDate(nextAutoPay(a.day, today, a.lastMonth))}`}`
                      : "Off: record each month yourself"}
                </span>
              </span>
              {m ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-ink">Auto-debit on</span>
              ) : (
                <>
                  <Toggle label={`Auto-save ${g.name}`} on={Boolean(a)} onChange={(on) => update((p) => setAutoSave(p, g.id, on ? (a?.day ?? 1) : null))} />
                  <Button size="xs" variant="outline" onClick={() => openMandateSetup(g.id)} data-testid={`auto-debit-${g.name}`}>
                    <Building2Icon /> Auto-debit
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-input"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} aria-hidden />
    </button>
  );
}

function DaySelect({ label, day, onChange }: { label: string; day: number; onChange: (d: number) => void }) {
  return (
    <select className="h-7 rounded-md border bg-background px-1 text-xs" value={day} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          Day {n}
        </option>
      ))}
    </select>
  );
}
