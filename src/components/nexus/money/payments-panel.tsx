"use client";

import { ArrowDownToLineIcon, BotIcon, Building2Icon, CircleUserIcon, LockIcon, ReceiptIcon, RepeatIcon, ScanTextIcon, SparklesIcon, Trash2Icon, WalletIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MoneyPlan, Purchase } from "@/lib/nexus/budget";
import { monthPayments, type PaymentSource } from "@/lib/nexus/money-payments";
import { addDetected, detectPayments, KIND_LABEL, type DetectedPayment } from "@/lib/nexus/spend-detect";
import { useFmt } from "./currency";
import type { UpdatePlan } from "./money-planner";
import { Notice } from "./money-planner";

const SOURCE: Record<PaymentSource, { label: string; Icon: typeof ReceiptIcon; tone: string }> = {
  "auto-pay": { label: "Auto-pay", Icon: RepeatIcon, tone: "bg-success-soft text-success-ink" },
  detected: { label: "Auto-detected", Icon: SparklesIcon, tone: "bg-brand-soft text-brand-ink" },
  you: { label: "Added by you", Icon: CircleUserIcon, tone: "bg-secondary text-muted-foreground" },
  paypal: { label: "PayPal", Icon: WalletIcon, tone: "bg-brand-soft text-brand-ink" },
  "auto-save": { label: "Auto-save", Icon: LockIcon, tone: "bg-gold-soft text-gold-ink" },
  "auto-debit": { label: "Auto-debit (simulated)", Icon: Building2Icon, tone: "bg-gold-soft text-gold-ink" },
  saving: { label: "Saved", Icon: LockIcon, tone: "bg-gold-soft text-gold-ink" },
};

const EXAMPLE = `Rs.450 debited from A/c XX1234 to VPA swiggy@icici on 05-11-26
INR 2,340 spent at DMART on 07-11-26. Avl bal INR 45,000
Netflix 649`;

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

type Draft = DetectedPayment & { chosenBillId: string | null; include: boolean };

/**
 * Payments: everything paid this month in one list, and spending added
 * automatically from pasted bank messages, sorted into your categories.
 */
export function PaymentsPanel({ plan, purchases, update, now, today }: { plan: MoneyPlan; purchases: Purchase[]; update: UpdatePlan; now: string; today: string }) {
  const fmt = useFmt();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => monthPayments(plan, purchases, now), [plan, purchases, now]);
  const total = rows.reduce((t, r) => t + r.amountCents, 0);
  const spent = rows.filter((r) => r.source !== "auto-save" && r.source !== "auto-debit" && r.source !== "saving").reduce((t, r) => t + r.amountCents, 0);
  const shown = showAll ? rows : rows.slice(0, 8);

  function detect() {
    const found = detectPayments(plan, text, today);
    setNotice(found.length ? null : "No payments found. Paste a bank SMS, a UPI alert or statement lines, or type something like “Swiggy 450”.");
    setDrafts(found.length ? found.map((d) => ({ ...d, chosenBillId: d.billId, include: !d.duplicate })) : null);
  }

  function save() {
    if (!drafts) return;
    const picked = drafts.filter((d) => d.include);
    update((p) => addDetected(p, picked).plan);
    setNotice(`Added ${picked.length} payment${picked.length === 1 ? "" : "s"} to your spending. Shops you sorted are remembered for next time.`);
    setDrafts(null);
    setText("");
  }

  const toAdd = drafts?.filter((d) => d.include) ?? [];

  return (
    <section className="surface space-y-5 p-5" aria-labelledby="payments-title" data-testid="payments">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="payments-title" className="flex items-center gap-2 text-[15px] font-semibold">
            <ReceiptIcon className="size-4 text-gold-ink" aria-hidden /> Payments
          </h2>
          <p className="text-xs text-muted-foreground">Everything paid this month: bills, spending, PayPal and savings.</p>
        </div>
        <p className="tabular text-right text-sm" data-testid="payments-total">
          <b>{fmt(total)}</b> <span className="text-muted-foreground">paid this month</span>
          <span className="block text-[11px] text-muted-foreground">
            {fmt(spent)} spent · {fmt(total - spent)} saved
          </span>
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-secondary/40 p-4">
        <div className="flex items-start gap-2">
          <ScanTextIcon className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
          <div>
            <p className="text-sm font-medium">Add spending automatically</p>
            <p className="text-xs text-muted-foreground">Paste bank SMS, UPI alerts or statement lines, or type “Swiggy 450”. We find the amount, date and shop and sort it into food, groceries, transport and more.</p>
          </div>
        </div>
        <label className="block">
          <span className="sr-only">Paste bank messages or type a payment</span>
          <textarea
            className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
            placeholder="Paste bank SMS or statement lines here, or type “Swiggy 450”"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="detect-input"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BotIcon className="size-3.5" aria-hidden /> Read on this device only. Nothing is sent to your bank, PayPal or an AI service.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLE)} data-testid="detect-example">
              Try an example
            </Button>
            <Button size="sm" disabled={!text.trim()} onClick={detect} data-testid="detect">
              <SparklesIcon /> Detect
            </Button>
          </div>
        </div>

        {drafts && (
          <div className="space-y-3" data-testid="detected">
            <ul className="divide-y rounded-xl border bg-card">
              {drafts.map((d, i) => (
                <li key={`${d.key}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm" data-testid="detected-row">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={d.include}
                    onChange={(e) => setDrafts((all) => all!.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    aria-label={`Add ${d.merchant} ${fmt(d.amountCents)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.merchant}</span> <span className="tabular text-muted-foreground">· {shortDate(d.date)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {KIND_LABEL[d.kind]} · {d.reason}
                      {d.duplicate && !d.reason.startsWith("Already") ? " · already added" : ""}
                      {d.otherCurrency ? ` · written in ${d.otherCurrency}; added as ${plan.currency ?? "USD"}` : ""}
                    </span>
                  </span>
                  <span className="tabular font-medium">{fmt(d.amountCents)}</span>
                  <select
                    className="ml-7 h-8 w-[calc(100%-1.75rem)] rounded-md border bg-background px-1.5 text-xs sm:ml-0 sm:w-auto sm:max-w-48"
                    value={d.chosenBillId ?? "free"}
                    onChange={(e) => setDrafts((all) => all!.map((x, j) => (j === i ? { ...x, chosenBillId: e.target.value === "free" ? null : e.target.value } : x)))}
                    aria-label={`Category for ${d.merchant}`}
                    data-testid="detected-category"
                  >
                    {plan.bills.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                    <option value="free">Not in my plan</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrafts(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!toAdd.length} onClick={save} data-testid="add-detected">
                <ArrowDownToLineIcon /> Add {toAdd.length} payment{toAdd.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
        {notice && <Notice tone={notice.startsWith("Added") ? "success" : "warning"}>{notice}</Notice>}
      </div>

      {rows.length ? (
        <div className="space-y-2">
          <ul className="divide-y rounded-xl border" aria-label="Payments this month" data-testid="payment-list">
            {shown.map((r) => {
              const s = SOURCE[r.source];
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm" data-testid="payment-row" data-source={r.source}>
                  <span className="tabular w-12 shrink-0 text-xs text-muted-foreground">{shortDate(r.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium ${s.tone}`}>
                        <s.Icon className="size-3" aria-hidden /> {s.label}
                      </span>
                      {r.category}
                    </span>
                  </span>
                  <span className="tabular text-right font-medium">
                    {r.estimated ? "≈ " : ""}
                    {fmt(r.amountCents)}
                  </span>
                  {r.expenseId ? (
                    <Button variant="ghost" size="icon-xs" aria-label={`Remove ${r.name} ${fmt(r.amountCents)}`} onClick={() => update((p) => ({ ...p, expenses: p.expenses.filter((e) => e.id !== r.expenseId) }))}>
                      <Trash2Icon />
                    </Button>
                  ) : (
                    <span className="w-6" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > 8 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} data-testid="payments-show-all">
              {showAll ? "Show fewer" : `Show all ${rows.length} payments`}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No payments yet this month. Auto-pay bills appear here on their day.</p>
      )}
    </section>
  );
}
