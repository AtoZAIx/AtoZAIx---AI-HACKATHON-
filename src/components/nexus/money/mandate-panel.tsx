"use client";

import { BadgeCheckIcon, BellRingIcon, Building2Icon, LandmarkIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { monthLabel, type Goal, type Mandate } from "@/lib/nexus/budget";
import { localDay } from "@/lib/nexus/household";
import { approveMandate, cancelMandate, checkMandate, debitDate, firstDebitMonth, mandateEndDate, MANDATE_MAX_CENTS, nextDebit, skipMandateMonth, unskipMandateMonth } from "@/lib/nexus/mandate";
import { CurrencyInput, useCurrency, useFmt } from "./currency";
import type { UpdatePlan } from "./money-planner";

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const RAIL: Record<Mandate["rail"], { label: string; where: string; icon: typeof SmartphoneIcon }> = {
  "upi-autopay": {
    label: "UPI AutoPay",
    where: "your UPI app",
    icon: SmartphoneIcon,
  },
  "e-nach": {
    label: "e-NACH (bank account)",
    where: "your bank’s page",
    icon: LandmarkIcon,
  },
};

/**
 * Pre-approved monthly auto-debit for a locked fund (simulated). Follows the
 * shape of RBI's e-mandate rules: the user reviews and approves once, gets a
 * notice 24 hours before each debit, and can skip a month or cancel any time.
 */
export function MandatePanel({ goal, update, now, suggestedCents }: { goal: Goal; update: UpdatePlan; now: string; suggestedCents: number }) {
  const m = goal.mandate;
  if (m?.status === "active") return <ActiveMandate goal={goal} mandate={m} update={update} />;
  return <MandateSetup goal={goal} update={update} now={now} suggestedCents={suggestedCents} previous={m ?? null} />;
}

function SimulatedBadge() {
  return <span className="rounded-full border border-warning/50 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-ink">Simulated</span>;
}

function MandateSetup({ goal, update, now, suggestedCents, previous }: { goal: Goal; update: UpdatePlan; now: string; suggestedCents: number; previous: Mandate | null }) {
  const formatMoney = useFmt();
  const currency = useCurrency();
  const today = localDay();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"review" | "approve">("review");
  const [rail, setRail] = useState<Mandate["rail"]>("upi-autopay");
  const [amount, setAmount] = useState(() => Math.min(MANDATE_MAX_CENTS, Math.max(suggestedCents, 1_000_00)));
  const [day, setDay] = useState(5);
  const [agreeDebit, setAgreeDebit] = useState(false);
  const [agreeControl, setAgreeControl] = useState(false);
  const check = checkMandate(goal, { amountCents: amount, day, rail }, currency);
  // "Auto-debit" in the Automatic payments card opens this setup and brings it into view.
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ goalId: string }>).detail?.goalId !== goal.id) return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById(`mandate-${goal.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    window.addEventListener("nexus:open-mandate", onOpen);
    return () => window.removeEventListener("nexus:open-mandate", onOpen);
  }, [goal.id]);
  const first = debitDate(firstDebitMonth(goal, day, today), day);
  const end = mandateEndDate(goal, now);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-gold/50 bg-gold-soft/30 px-3 py-2 text-xs" id={`mandate-${goal.id}`} data-testid="mandate-offer">
        <span className="flex items-center gap-1.5">
          <Building2Icon className="size-4 text-gold-ink" aria-hidden />
          {previous?.status === "cancelled"
            ? `Auto-debit was cancelled on ${dateLabel(previous.cancelledAt?.slice(0, 10) ?? today)}.`
            : "Want it taken from your bank account each month, automatically?"}
        </span>
        <Button size="xs" variant="outline" onClick={() => setOpen(true)} data-testid="mandate-start" disabled={!goal.lockMonths || Boolean(goal.withdrawal)}>
          {previous?.status === "cancelled" ? "Set up again" : "Set up auto-debit"}
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-gold/40 bg-card p-4 text-sm shadow-[var(--shadow-raised)]" aria-labelledby={`mandate-title-${goal.id}`} id={`mandate-${goal.id}`} data-testid="mandate-setup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`mandate-title-${goal.id}`} className="font-semibold">
          Set up monthly auto-debit for {goal.name}
        </h3>
        <SimulatedBadge />
      </div>

      {step === "review" ? (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">How should it be debited?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(RAIL) as Mandate["rail"][]).map((r) => {
                const Icon = RAIL[r].icon;
                return (
                  <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs ${rail === r ? "border-brand bg-brand-soft/50" : ""}`}>
                    <input type="radio" name={`rail-${goal.id}`} checked={rail === r} onChange={() => setRail(r)} />
                    <Icon className="size-4 text-brand-ink" aria-hidden />
                    <span>
                      <b>{RAIL[r].label}</b>
                      <span className="block text-muted-foreground">You approve it in {RAIL[r].where}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-xs">
              <p className="font-medium">Amount each month</p>
              <CurrencyInput label="Auto-debit amount each month" cents={amount} onChange={setAmount} className="h-9" />
              <p className="text-[11px] text-muted-foreground">
                Between {formatMoney(check.minCents)} and {formatMoney(check.maxCents)}. This month’s plan: {formatMoney(suggestedCents)}.
              
                {suggestedCents > amount && check.ok && <> The other {formatMoney(suggestedCents - amount)} a month you can add as extra.</>}
              </p>
            </div>
            <label className="space-y-1 text-xs">
              <span className="block font-medium">Debit day</span>
              <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Auto-debit day">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {ordinal(n)} of every month
                  </option>
                ))}
              </select>
            </label>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg bg-secondary/60 p-3 text-xs sm:grid-cols-2" data-testid="mandate-summary">
            <Row k="Purpose" v={`Locked savings: ${goal.name}`} />
            <Row k="Amount" v={`${formatMoney(amount)} every month`} />
            <Row k="First debit" v={dateLabel(first)} />
            <Row k="Ends" v={`${dateLabel(end)} (when the fund matures)`} />
            <Row k="Notice" v="At least 24 hours before every debit" />
            <Row k="Your control" v="Skip any month or cancel any time" />
            {goal.lockMonths && goal.stepUp !== null && <Row k="Step-up" v="Your plan grows each payment; the auto-debit stays at the amount you approve. Raise it later or add the rest as extra." />}
          </dl>

          <div className="space-y-1.5 text-xs">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={agreeDebit} onChange={(e) => setAgreeDebit(e.target.checked)} data-testid="mandate-agree-debit" />
              <span>
                I authorise a debit of up to <b>{formatMoney(amount)}</b> on the {ordinal(day)} of each month from {dateLabel(first)} until {dateLabel(end)}, into my locked savings for {goal.name}.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={agreeControl} onChange={(e) => setAgreeControl(e.target.checked)} data-testid="mandate-agree-control" />
              <span>I understand I’ll get a notice 24 hours before each debit and can skip a month or cancel at any time.</span>
            </label>
          </div>

          {!check.ok && (
            <ul className="space-y-0.5 text-xs text-error-ink" role="status">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!check.ok || !agreeDebit || !agreeControl} onClick={() => setStep("approve")} data-testid="mandate-continue">
              Continue to approval
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3" data-testid="mandate-approve">
          <div className="space-y-2 rounded-lg border-2 border-dashed border-brand/40 bg-brand-soft/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink">
              <ShieldCheckIcon className="size-4" aria-hidden /> {RAIL[rail].label} approval (simulated)
            </p>
            <p className="text-xs">
              In the live version, this step opens {RAIL[rail].where}, where you approve a mandate of <b>{formatMoney(amount)}</b> a month for {goal.name}.
            </p>
            <p className="text-xs font-medium">AtoZAIx will never ask for your UPI PIN, OTP or bank password.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const ref = `NXM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
                update((p) => approveMandate(p, goal.id, { amountCents: amount, day, rail }, { ref, consentAt: new Date().toISOString(), today, now }));
              }}
              data-testid="mandate-approve-button"
            >
              <BadgeCheckIcon /> Approve mandate (simulated)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep("review")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ActiveMandate({ goal, mandate: m, update }: { goal: Goal; mandate: Mandate; update: UpdatePlan }) {
  const formatMoney = useFmt();
  const today = localDay();
  const next = nextDebit(goal, today);
  const [confirm, setConfirm] = useState<"skip" | "cancel" | null>(null);
  const debited = m.debits.filter((d) => d.status === "debited").reduce((t, d) => t + d.amountCents, 0);
  const Icon = RAIL[m.rail].icon;

  return (
    <section className="space-y-2.5 rounded-xl border border-success/40 bg-success-soft/40 p-3 text-xs" aria-label={`Auto-debit for ${goal.name}`} data-testid="mandate-active">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4 text-success-ink" aria-hidden /> Auto-debit active
        </p>
        <SimulatedBadge />
      </div>
      <p className="tabular">
        <b>{formatMoney(m.amountCents)}</b> on the {ordinal(m.day)} of each month by {RAIL[m.rail].label}, until {dateLabel(m.endDate)} · Ref{" "}
        <span className="font-mono" data-testid="mandate-ref">
          {m.ref}
        </span>
      </p>

      {next && next.noticeOpen && !next.skipped && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-warning-ink" role="status" data-testid="mandate-notice">
          <BellRingIcon className="mt-px size-4 shrink-0" aria-hidden />
          <span>
            <b>Pre-debit notice:</b> {formatMoney(next.amountCents)} will be debited on {dateLabel(next.date)} for locked savings ({goal.name}). Mandate {m.ref}.
          </span>
        </p>
      )}

      {next ? (
        <p className="text-muted-foreground" data-testid="mandate-next">
          {next.skipped ? (
            <>
              You skipped the debit on {shortDate(next.date)}.{" "}
              <button type="button" className="font-medium text-brand-ink underline-offset-2 hover:underline" onClick={() => update((p) => unskipMandateMonth(p, goal.id, next.month))}>
                Undo skip
              </button>
            </>
          ) : (
            <>
              Next debit {formatMoney(next.amountCents)} on {dateLabel(next.date)} · notice on {shortDate(next.noticeDate)}
            </>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground">No more debits are due.</p>
      )}

      {confirm === null ? (
        <div className="flex flex-wrap gap-2">
          {next && !next.skipped && (
            <Button size="xs" variant="outline" onClick={() => setConfirm("skip")} data-testid="mandate-skip">
              Skip {monthLabel(next.month)}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setConfirm("cancel")} data-testid="mandate-cancel">
            Cancel auto-debit
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border bg-background p-2.5">
          <p>
            {confirm === "skip"
              ? `Skip the ${formatMoney(next?.amountCents ?? 0)} debit on ${next ? dateLabel(next.date) : ""}? Your goal will need a little more later.`
              : "Cancel this auto-debit? No more money will be taken. What’s already saved stays in your locked fund."}
          </p>
          <p className="text-[11px] text-muted-foreground">In the live version you confirm this in {RAIL[m.rail].where}.</p>
          <div className="flex gap-2">
            <Button
              size="xs"
              onClick={() => {
                if (confirm === "skip" && next) update((p) => skipMandateMonth(p, goal.id, next.month));
                if (confirm === "cancel") update((p) => cancelMandate(p, goal.id, new Date().toISOString()));
                setConfirm(null);
              }}
              data-testid="mandate-confirm"
            >
              {confirm === "skip" ? "Confirm skip" : "Confirm cancel"}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {m.debits.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            Debit history ({m.debits.length}) · {formatMoney(debited)} so far
          </summary>
          <ul className="mt-1 space-y-0.5" data-testid="mandate-history">
            {[...m.debits].reverse().map((d) => (
              <li key={d.month} className="flex justify-between gap-2">
                <span>
                  {dateLabel(d.date)} · {d.status === "debited" ? "Debited (simulated)" : "Skipped"}
                </span>
                <span className="tabular">{formatMoney(d.amountCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-muted-foreground">Simulated: no money moves. Going live needs a licensed bank partner to hold the fund and an RBI-authorised provider to run the mandate.</p>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
