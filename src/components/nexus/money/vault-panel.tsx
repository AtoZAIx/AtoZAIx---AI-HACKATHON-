"use client";

import { LockIcon, RepeatIcon, TrendingUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { addMonths, monthLabel, stepUpOf, withdrawalQuote, type Goal, type MoneyPlan, type StepUp } from "@/lib/nexus/budget";
import { hasActiveMandate } from "@/lib/nexus/mandate";
import { autoSaveOf, localDay, nextAutoPay, recordContribution, requestWithdrawal, setAutoSave, setChosenMonthly, setPaused, setStepUp, vault } from "@/lib/nexus/household";
import { CurrencyInput, useCurrency, useFmt } from "./currency";
import { LockTimeline } from "./goal-visuals";
import { MandatePanel } from "./mandate-panel";
import type { UpdatePlan } from "./money-planner";

const monthIdx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * A goal's virtual savings vault: lock-in, maturity, required monthly amount
 * and a contribution ledger. Recording here never moves real money.
 */
export function VaultDetails({ goal, monthlyCents, update, now }: { goal: Goal; monthlyCents: number; update: UpdatePlan; now: string }) {
  const formatMoney = useFmt();
  const today = localDay();
  const currency = useCurrency();
  const v = vault(goal, now, today, currency);
  const [extra, setExtra] = useState(0);
  const [confirm, setConfirm] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const contribution = monthlyCents || v.requiredMonthly;
  const apply = (fn: (p: MoneyPlan) => { plan: MoneyPlan; duplicate: boolean }) => {
    let duplicate = false;
    update((p) => {
      const r = fn(p);
      duplicate = r.duplicate;
      return r.plan;
    });
    setNote(duplicate ? "Already recorded, so it wasn’t added twice." : null);
  };
  const closed = Boolean(goal.withdrawal);
  const quote = withdrawalQuote(v.saved, !v.matured);

  return (
    <div className="space-y-3 rounded-xl bg-secondary/60 p-3" data-testid="vault">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon className="size-3.5" aria-hidden /> Locked savings, built to keep your money safe: when live, it’s held in your name by a regulated partner bank, never by PayPal Nexus. Today this plan is simulated in the app.
      </p>
      <LockTimeline
        step={Math.min(v.lockMonths, Math.max(1, monthIdx(now) - monthIdx(v.startMonth) + 1))}
        months={v.lockMonths}
        startLabel={`Started ${monthLabel(v.startMonth)}`}
        endLabel={`Unlocks ${dateLabel(v.maturityDate)}`}
      />
      {!goal.withdrawal && !hasActiveMandate(goal) && <AutoSave goal={goal} today={today} now={now} update={update} amount={contribution} />}
      {!goal.withdrawal && v.remaining > 0 && <MandatePanel goal={goal} update={update} now={now} suggestedCents={contribution} />}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] text-muted-foreground">Lock-in</dt>
          <dd>
            {v.lockMonths} months from {monthLabel(v.startMonth)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Matures</dt>
          <dd data-testid="vault-maturity">
            {dateLabel(v.maturityDate)} {v.matured ? "(matured)" : `(${v.daysToMaturity} days)`}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Needed each month</dt>
          <dd className="tabular font-semibold" data-testid="vault-required">
            {formatMoney(v.requiredMonthly)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Saved</dt>
          <dd className="tabular">
            {formatMoney(v.saved)} ({Math.round(v.completion * 100)}%)
          </dd>
        </div>
      </dl>
      {v.remaining > 0 && <StepUpCard goal={goal} schedule={v.schedule} startMonth={now} update={update} />}
      <p className="text-xs text-muted-foreground" data-testid="vault-to-go">
        {v.remaining === 0
          ? `Fully saved. It stays locked until ${dateLabel(v.maturityDate)}.`
          : v.monthsToFinish < v.monthsLeft
            ? `${formatMoney(v.remaining)} to go: saved in about ${v.monthsToFinish} month${v.monthsToFinish === 1 ? "" : "s"}, then kept locked until ${dateLabel(v.maturityDate)}.`
            : `${formatMoney(v.remaining)} to go over ${v.monthsLeft} month${v.monthsLeft === 1 ? "" : "s"}.`}
      </p>
      <div className="rounded-lg border border-dashed bg-background/60 px-3 py-2 text-xs" data-testid="vault-maturity-total">
        <p>
          At maturity you’ll have set aside <b className="tabular">{formatMoney(v.maturityTotal)}</b> of your own money.
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="vault-minimum-rule">
          {v.remaining > 0 && v.remaining < v.minimumMonthly
            ? `Only ${formatMoney(v.remaining)} is left to save, so that’s all this fund needs.`
            : `This fund takes at least ${formatMoney(v.minimumMonthly)} a month, and all your goals together get at least 10% of your income.`}{" "}
          After the lock-in ends, your savings can earn interest from our partner bank. The rate isn’t fixed or guaranteed, and nothing earns interest while the plan is simulated.
        </p>
      </div>
      {v.missedMonths.length > 0 && !goal.paused && (
        <p className="text-xs text-warning-ink">No contribution recorded for {v.missedMonths.map(monthLabel).join(", ")}. Add extra money to catch up, or give the goal more time.</p>
      )}
      {goal.paused && <p className="text-xs text-muted-foreground">Contributions are paused. Resume whenever you’re ready.</p>}

      {!closed && (
        <div className="flex flex-wrap items-center gap-2">
          {hasActiveMandate(goal) ? (
            <span className="text-xs text-muted-foreground">Monthly amount is taken by auto-debit.</span>
          ) : (
            <Button
              size="xs"
              disabled={v.contributedThisMonth || goal.paused || contribution <= 0}
              onClick={() =>
                apply((p) =>
                  recordContribution(p, goal.id, {
                    month: now,
                    date: today,
                    amountCents: contribution,
                    kind: "scheduled",
                  }),
                )
              }
              data-testid="record-contribution"
            >
              {v.contributedThisMonth ? "This month is recorded" : `Record this month’s ${formatMoney(contribution)}`}
            </Button>
          )}
          <Button size="xs" variant="outline" onClick={() => update((p) => setPaused(p, goal.id, !goal.paused))}>
            {goal.paused ? "Resume" : "Pause"}
          </Button>
          <span className="flex items-center gap-1.5">
            <CurrencyInput label={`Extra money for ${goal.name}`} cents={extra} onChange={setExtra} className="h-8 w-28" />
            <Button
              size="xs"
              variant="outline"
              disabled={extra <= 0}
              onClick={() => {
                const key = crypto.randomUUID();
                apply((p) =>
                  recordContribution(p, goal.id, {
                    month: now,
                    date: today,
                    amountCents: extra,
                    kind: "extra",
                    key,
                  }),
                );
                setExtra(0);
              }}
            >
              Add extra
            </Button>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Monthly amount</span>
            <CurrencyInput
              label={`${goal.name} monthly amount`}
              cents={goal.chosenMonthlyCents ?? v.requiredMonthly}
              onChange={(c) => update((p) => setChosenMonthly(p, goal.id, c))}
              className="h-8 w-28"
            />
          </span>
          {goal.chosenMonthlyCents != null && goal.chosenMonthlyCents < v.minimumMonthly && v.remaining > goal.chosenMonthlyCents && (
            <span className="text-xs text-warning-ink" role="status" data-testid="vault-minimum">
              Below the {formatMoney(v.minimumMonthly)} minimum, so {formatMoney(v.minimumMonthly)} is used.
            </span>
          )}
        </div>
      )}
      {note && (
        <p className="text-xs text-muted-foreground" role="status">
          {note}
        </p>
      )}

      {(goal.contributions ?? []).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Contribution history ({goal.contributions!.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {[...goal.contributions!].reverse().map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>
                  {dateLabel(c.date)} · {c.kind === "extra" ? "Extra" : `For ${monthLabel(c.month)}`} · recorded (virtual)
                </span>
                <span className="tabular">{formatMoney(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {goal.withdrawal ? (
        <p className="text-xs" role="status" data-testid="withdrawal-done">
          Withdrawal requested on {dateLabel(goal.withdrawal.requestedAt)}
          {goal.withdrawal.early && goal.withdrawal.feeCents
            ? `: balance ${formatMoney(goal.withdrawal.amountCents)}, early-withdrawal charge ${formatMoney(goal.withdrawal.feeCents)} (7%), you receive ${formatMoney(goal.withdrawal.payoutCents ?? goal.withdrawal.amountCents)}`
            : `: you receive ${formatMoney(goal.withdrawal.payoutCents ?? goal.withdrawal.amountCents)}, no charge`}
          . This is simulated: with a live partner bank, it would be verified and paid out by them.
        </p>
      ) : !withdrawing ? (
        <Button size="xs" variant="ghost" onClick={() => setWithdrawing(true)}>
          {v.matured ? "Withdraw (matured)" : "Request early withdrawal"}
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border bg-background p-2 text-xs">
          {!v.matured ? (
            <div className="space-y-1 rounded-md bg-warning-soft p-2 text-warning-ink" data-testid="early-withdrawal-quote">
              <p>
                This plan matures on {dateLabel(v.maturityDate)}. Breaking the lock early costs a <b>7% wallet charge</b> on your current balance, and ends the plan.
              </p>
              <dl className="tabular grid grid-cols-3 gap-2 text-foreground">
                <div>
                  <dt className="text-[11px] text-warning-ink">Balance</dt>
                  <dd className="font-semibold">{formatMoney(quote.payoutCents + quote.feeCents)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-warning-ink">Charge (7%)</dt>
                  <dd className="font-semibold">−{formatMoney(quote.feeCents)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-warning-ink">You receive</dt>
                  <dd className="font-semibold">{formatMoney(quote.payoutCents)}</dd>
                </div>
              </dl>
              <p className="text-[11px]">Wait until {dateLabel(v.maturityDate)} to withdraw with no charge.</p>
            </div>
          ) : (
            <p>Your plan has matured: you receive {formatMoney(quote.payoutCents)}, with no charge.</p>
          )}
          <label className="block space-y-1">
            <span>To confirm it’s you, type the goal name: {goal.name}</span>
            <input className="h-8 w-full rounded-lg border px-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button size="xs" disabled={confirm.trim() !== goal.name} onClick={() => update((p) => requestWithdrawal(p, goal.id, today, now))}>
              Request withdrawal
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setWithdrawing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

/** Monthly auto-save: on its day, this month's amount is recorded into the locked fund. Nothing moves from a bank. */
function AutoSave({ goal, today, now, update, amount }: { goal: Goal; today: string; now: string; update: UpdatePlan; amount: number }) {
  const formatMoney = useFmt();
  const a = autoSaveOf(goal);
  const saved = (goal.contributions ?? []).find((c) => c.month === now && c.kind === "scheduled");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background/70 px-3 py-2 text-xs" data-testid="auto-save">
      <label className="flex items-center gap-1.5 font-medium">
        <input type="checkbox" checked={Boolean(a)} onChange={(e) => update((p) => setAutoSave(p, goal.id, e.target.checked ? (a?.day ?? 1) : null))} data-testid="auto-save-toggle" />
        <RepeatIcon className="size-3.5 text-gold-ink" aria-hidden />
        Auto-save each month
      </label>
      {a && (
        <>
          <label className="flex items-center gap-1 text-muted-foreground">
            on day
            <select
              className="h-7 rounded-md border bg-background px-1 text-foreground"
              value={a.day}
              onChange={(e) => update((p) => setAutoSave(p, goal.id, Number(e.target.value)))}
              aria-label={`${goal.name} auto-save day`}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className={saved ? "pop-in font-medium text-success-ink" : "text-muted-foreground"} data-testid="auto-save-status">
            {saved ? `Saved ${formatMoney(saved.amountCents)} on ${shortDate(saved.date)}` : `${formatMoney(amount)} on the ${ordinal(a.day)}`} · next{" "}
            {shortDate(nextAutoPay(a.day, today, a.lastMonth))}
          </span>
        </>
      )}
      <span className="w-full text-[11px] text-muted-foreground">Recorded in your plan automatically; it doesn’t move money from your bank.</span>
    </div>
  );
}

const STEP_CHOICES: Array<{ id: string; label: string; step: StepUp | null }> = [
  { id: "month", label: "5% more every month", step: { pct: 0.05, every: "month" } },
  { id: "year", label: "5% more every year", step: { pct: 0.05, every: "year" } },
  { id: "none", label: "Same amount every month", step: null },
];

/**
 * Step-up: how each payment grows. Shows every planned payment as a bar
 * (this month highlighted), next month's amount and the last one, and warns
 * when monthly growth makes the last payment much bigger than the first.
 */
function StepUpCard({ goal, schedule, startMonth, update }: { goal: Goal; schedule: number[]; startMonth: string; update: UpdatePlan }) {
  const formatMoney = useFmt();
  const step = stepUpOf(goal);
  const choice = step ? step.every : "none";
  const pays = schedule.filter((x) => x > 0);
  const max = Math.max(1, ...pays);
  const first = pays[0] ?? 0;
  const next = pays[1];
  const last = pays[pays.length - 1] ?? 0;
  const lastMonth = addMonths(startMonth, pays.length - 1);
  const ratio = first > 0 ? last / first : 1;
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const own = goal.chosenMonthlyCents != null;

  return (
    <div className="space-y-2.5 rounded-lg border bg-background/70 px-3 py-2.5 text-xs" data-testid="step-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium">
          <TrendingUpIcon className="size-3.5 text-gold-ink" aria-hidden /> Grow your payment
        </p>
        <select
          className="h-7 rounded-md border bg-background px-1.5"
          value={choice}
          onChange={(e) => update((p) => setStepUp(p, goal.id, STEP_CHOICES.find((c) => c.id === e.target.value)!.step))}
          aria-label={`${goal.name}: how each payment grows`}
          data-testid="step-up-choice"
        >
          {STEP_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {own ? (
        <p className="text-muted-foreground">You set your own monthly amount, so it stays the same each month. Clear the monthly amount to use the step-up.</p>
      ) : (
        <>
          <div className="flex h-16 items-end gap-px" aria-hidden>
            {pays.map((x, i) => (
              <span
                key={i}
                className={`flex-1 rounded-t-sm ${i === 0 ? "bg-gold-ink" : "bg-gold/60"}`}
                style={{ height: grown ? `${Math.max(4, (x / max) * 100)}%` : "4%", transition: `height 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(i * 15, 600)}ms` }}
                title={`${monthLabel(addMonths(startMonth, i))}: ${formatMoney(x)}`}
              />
            ))}
          </div>
          <p className="tabular" data-testid="step-up-summary">
            This month <b>{formatMoney(first)}</b>
            {next ? (
              <>
                {" "}
                → next month <b>{formatMoney(next)}</b>
              </>
            ) : null}
            {pays.length > 2 ? (
              <>
                {" "}
                → last payment ({monthLabel(lastMonth)}) <b>{formatMoney(last)}</b>
              </>
            ) : null}
            .
          </p>
          {step?.every === "month" && ratio >= 3 && (
            <p className="text-warning-ink" role="status" data-testid="step-up-warning">
              By the last month this asks {formatMoney(last)} a month, about {Math.round(ratio)}× the first. Choose monthly growth only if your income will grow as fast; yearly growth is gentler.
            </p>
          )}
        </>
      )}
    </div>
  );
}
