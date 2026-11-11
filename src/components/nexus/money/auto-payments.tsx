"use client";

import { Building2Icon, LockIcon, PlusIcon, ReceiptIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { goalSaved, type MoneyPlan, type MonthPlan } from "@/lib/nexus/budget";
import { autoSaveOf, nextAutoPay, setAutoPay, setAutoSave } from "@/lib/nexus/household";
import { nextDebit } from "@/lib/nexus/mandate";
import { addMonthlyPayment, PAYMENT_GROUPS, removeMonthlyPayment, suggestedSource } from "@/lib/nexus/money-payments";
import { CurrencyInput, useFmt } from "./currency";
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
  const [adding, setAdding] = useState(false);
  const bills = plan.bills.filter((b) => ((b.kind ?? "need") === "need" || b.recurring) && b.amountCents > 0);
  const funds = plan.goals.filter((g) => g.lockMonths && !g.withdrawal && g.targetCents - goalSaved(g) > 0);
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

      {bills.length + funds.length > 0 && (
      <ul className="divide-y rounded-xl border">
        {bills.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm" data-testid={`auto-row-${b.name}`}>
            <ReceiptIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{b.name}</span> <span className="tabular text-muted-foreground">· {formatMoney(b.amountCents)}</span>
              {b.recurring && <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-px text-[10px] text-muted-foreground">{b.kind === "want" ? "ENJOY" : "LIVE"} · added by you</span>}
              <span className="block text-[11px] text-muted-foreground">
                {b.autoPay
                  ? `Auto-pay on the ${ordinal(b.autoPay.day)} · ${b.autoPay.lastMonth === now ? "paid this month" : `next ${shortDate(nextAutoPay(b.autoPay.day, today, b.autoPay.lastMonth))}`}`
                  : "Off: log it yourself when you pay"}
              </span>
            </span>
            <Toggle label={`Auto-pay ${b.name}`} on={Boolean(b.autoPay)} onChange={(on) => update((p) => setAutoPay(p, b.id, on ? (b.autoPay?.day ?? 1) : null))} />
            {b.autoPay && <DaySelect label={`${b.name} auto-pay day`} day={b.autoPay.day} onChange={(d) => update((p) => setAutoPay(p, b.id, d))} />}
            {b.recurring && (
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${b.name}`} onClick={() => update((p) => removeMonthlyPayment(p, b.id))} data-testid={`remove-payment-${b.name}`}>
                <Trash2Icon />
              </Button>
            )}
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
      )}
      {adding ? (
        <AddMonthlyPayment plan={plan} onCancel={() => setAdding(false)} onAdd={(p) => (update((x) => addMonthlyPayment(x, { ...p, today })), setAdding(false))} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="add-monthly-payment">
          <PlusIcon /> Add a monthly payment
        </Button>
      )}
    </section>
  );
}

/** A new monthly payment (electricity, Netflix, a gym…) with its own auto-pay day. */
function AddMonthlyPayment({ plan, onAdd, onCancel }: { plan: MoneyPlan; onAdd: (p: Parameters<typeof addMonthlyPayment>[1]) => void; onCancel: () => void }) {
  const formatMoney = useFmt();
  const [name, setName] = useState("");
  const [group, setGroup] = useState(PAYMENT_GROUPS[0].group);
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState<number | null>(5);
  const [takeOut, setTakeOut] = useState(true);
  const source = suggestedSource(plan, group);
  const g = PAYMENT_GROUPS.find((x) => x.group === group)!;
  const clash = plan.bills.some((b) => b.group === group && b.name === name.trim());
  return (
    <form
      className="space-y-3 rounded-xl border bg-secondary/40 p-4"
      aria-label="Add a monthly payment"
      data-testid="monthly-payment-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || amount <= 0 || clash) return;
        onAdd({ name, group, amountCents: amount, day, fromBillId: takeOut && source ? source.id : null });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">What is it?</span>
          <input className="h-9 w-full rounded-lg border bg-background px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Electricity, Netflix, gym…" maxLength={60} data-testid="payment-name" />
        </label>
        <div className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">Each month</p>
          <CurrencyInput label="Monthly amount" cents={amount} onChange={setAmount} className="h-9 w-full" />
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Type</span>
          <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={group} onChange={(e) => setGroup(e.target.value)} data-testid="payment-group">
            {PAYMENT_GROUPS.map((x) => (
              <option key={x.group} value={x.group}>
                {x.group} ({x.examples})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Auto-pay</span>
          <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={day ?? 0} onChange={(e) => setDay(Number(e.target.value) || null)} data-testid="payment-day">
            <option value={0}>Off: I’ll log it myself</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                On the {ordinal(n)} of each month
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Counts as {g.kind === "need" ? "LIVE (a must-pay)" : "ENJOY (on yourself)"}. Auto-pay records it in your plan on its day; no money moves from your bank.
      </p>
      {source && (
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5 size-4" checked={takeOut} onChange={(e) => setTakeOut(e.target.checked)} data-testid="payment-take-out" />
          <span>
            It’s already part of <b>{source.name}</b> ({formatMoney(source.amountCents)}): take it out of that, so it isn’t counted twice.
          </span>
        </label>
      )}
      {clash && <p className="text-xs text-warning-ink">You already have a payment called {name.trim()}.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim() || amount <= 0 || clash} data-testid="save-monthly-payment">
          Add payment
        </Button>
      </div>
    </form>
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
