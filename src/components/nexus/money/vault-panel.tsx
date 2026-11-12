"use client";

import { GiftIcon, LockIcon, RepeatIcon, Settings2Icon, TrendingUpIcon, TrophyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { addMonths, monthLabel, stepUpOf, withdrawalQuote, type Goal, type MoneyPlan, type StepUp } from "@/lib/nexus/budget";
import { hasActiveMandate } from "@/lib/nexus/mandate";
import { completionReward, REWARD_RULE, type CompletionReward, autoSaveOf, localDay, nextAutoPay, recordContribution, requestWithdrawal, setAutoSave, setChosenMonthly, setPaused, setStepUp, vault } from "@/lib/nexus/household";
import { CurrencyInput, useCurrency, useFmt } from "./currency";
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
 * A goal's locked fund, kept simple: how much is locked and until when, three
 * plain facts (this month, next payment, fully saved by), the completion
 * reward, and everything else under "Manage". Recording here never moves real money.
 */
export function VaultDetails({ goal, monthlyCents, reachMonth = null, update, now }: { goal: Goal; monthlyCents: number; reachMonth?: string | null; update: UpdatePlan; now: string }) {
  const formatMoney = useFmt();
  const today = localDay();
  const currency = useCurrency();
  const v = vault(goal, now, today, currency);
  const [extra, setExtra] = useState(0);
  const [confirm, setConfirm] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
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
  // "Auto-debit" in the Automatic payments card opens Manage, where the bank set-up lives.
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ goalId: string }>).detail?.goalId === goal.id) setManage(true);
    };
    window.addEventListener("nexus:open-mandate", onOpen);
    return () => window.removeEventListener("nexus:open-mandate", onOpen);
  }, [goal.id]);

  // The three facts.
  const mandate = hasActiveMandate(goal) ? goal.mandate! : null;
  const auto = mandate ? null : autoSaveOf(goal);
  const payDay = mandate?.day ?? auto?.day ?? null;
  // This month's amount comes from the plan (which tops goals up to 10% of income), so it matches the tracker.
  const planned = contribution;
  const thisMonthPaid = (goal.contributions ?? []).filter((c) => c.month === now).reduce((t, c) => t + c.amountCents, 0);
  const dueNow = Math.min(v.remaining, Math.max(0, planned - thisMonthPaid));
  const afterThisMonth = v.remaining - dueNow;
  const nextAmount = afterThisMonth > 0 ? Math.min(afterThisMonth, Math.max(v.schedule[1] ?? 0, planned)) : 0;
  const nextMonth = addMonths(now, 1);
  const doneBy = v.remaining === 0 ? null : (reachMonth ?? addMonths(now, Math.max(0, Math.min(v.monthsToFinish, v.monthsLeft) - 1)));
  const lockLeft = monthIdx(v.maturityMonth) - monthIdx(now);
  const howLong = v.matured ? "unlocked" : lockLeft >= 12 ? `in ${Math.floor(lockLeft / 12)} yr${lockLeft >= 24 ? "s" : ""}${lockLeft % 12 ? ` ${lockLeft % 12} mo` : ""}` : `in ${Math.max(1, lockLeft)} mo`;

  return (
    <div className="space-y-3" data-testid="vault">
      {/* 1. The locked money, at a glance. */}
      <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-gold-soft/70 to-background p-4" data-testid="vault-locked">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-gold-ink uppercase">
          <LockIcon className="size-3.5" aria-hidden /> {closed ? "Withdrawn" : v.matured ? "Unlocked" : "Locked money"}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="tabular text-3xl font-semibold" data-testid="vault-locked-amount">
            {formatMoney(v.saved)}
          </p>
          <p className="tabular text-sm text-muted-foreground">of {formatMoney(goal.targetCents)} goal</p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-background/80" role="progressbar" aria-label={`${goal.name}: locked so far`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.completion * 100)}>
          <div className="shimmer-fill h-2 rounded-full bg-gold-ink" style={{ width: `${Math.max(2, v.completion * 100)}%` }} />
        </div>
        <p className="tabular mt-2 text-xs" data-testid="vault-to-go">
          {v.remaining === 0 ? <b className="text-success-ink">Fully saved</b> : <><b>{formatMoney(v.remaining)}</b> left to save</>} · Unlocks{" "}
          <b data-testid="vault-maturity">{dateLabel(v.maturityDate)}</b> <span className="text-muted-foreground">
            ({howLong} ·{" "}
            <span data-testid="lock-timeline">
              month {Math.min(v.lockMonths, Math.max(1, monthIdx(now) - monthIdx(v.startMonth) + 1))} of {v.lockMonths}
            </span>
            )
          </span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">Kept safe in your name by a regulated partner bank, never by AtoZAIx. Today this plan is simulated in the app.</p>
      </div>

      {/* 2. Three plain facts. */}
      {!closed && v.remaining > 0 && (
        <dl className="grid grid-cols-1 gap-2 text-sm min-[440px]:grid-cols-3">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 min-[440px]:block" data-testid="vault-this-month">
            <dt className="text-[11px] text-muted-foreground">This month</dt>
            <dd className="tabular font-semibold">
              <span data-testid="vault-required">{formatMoney(thisMonthPaid > 0 ? thisMonthPaid : planned)}</span>
            </dd>
            <dd className="text-[11px]">
              {thisMonthPaid > 0 && dueNow === 0 ? (
                <span className="font-medium text-success-ink">✓ Saved</span>
              ) : thisMonthPaid > 0 ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-warning-ink">{formatMoney(dueNow)} still due</span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => apply((p) => recordContribution(p, goal.id, { month: now, date: today, amountCents: dueNow, kind: "extra", key: `topup-${now}-${thisMonthPaid}` }))}
                    data-testid="vault-pay-due"
                  >
                    Add {formatMoney(dueNow)}
                  </Button>
                </span>
              ) : goal.paused ? (
                <span className="text-muted-foreground">Paused</span>
              ) : payDay ? (
                <span className="text-muted-foreground">
                  {mandate ? "Auto-debit" : "Auto-save"} on the {ordinal(payDay)}
                </span>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-1"
                  disabled={contribution <= 0}
                  onClick={() => apply((p) => recordContribution(p, goal.id, { month: now, date: today, amountCents: contribution, kind: "scheduled" }))}
                  data-testid="record-contribution"
                >
                  Mark as saved
                </Button>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 min-[440px]:block" data-testid="vault-next">
            <dt className="text-[11px] text-muted-foreground">Next payment</dt>
            {nextAmount > 0 ? (
              <>
                <dd className="tabular font-semibold">{formatMoney(nextAmount)}</dd>
                <dd className="text-[11px] text-muted-foreground">{payDay ? shortDate(`${nextMonth}-${String(payDay).padStart(2, "0")}`) : monthLabel(nextMonth)}</dd>
              </>
            ) : (
              <dd className="text-[11px] text-muted-foreground">None: this month finishes it</dd>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 min-[440px]:block" data-testid="vault-done-by">
            <dt className="text-[11px] text-muted-foreground">Fully saved by</dt>
            <dd className="font-semibold">{doneBy ? monthLabel(doneBy) : "—"}</dd>
            <dd className="text-[11px] text-muted-foreground">then stays locked</dd>
          </div>
        </dl>
      )}

      {/* 3. The completion reward, in one line. */}
      <RewardCard reward={completionReward(goal, now, today)} />

      {v.missedMonths.length > 0 && !goal.paused && !closed && (
        <p className="text-xs text-warning-ink">No payment recorded for {v.missedMonths.map(monthLabel).join(", ")}. Add extra money under Manage to catch up.</p>
      )}
      {goal.paused && <p className="text-xs text-muted-foreground">Payments are paused. Resume under Manage whenever you’re ready.</p>}
      {goal.withdrawal && (
        <p className="text-xs" role="status" data-testid="withdrawal-done">
          Withdrawal requested on {dateLabel(goal.withdrawal.requestedAt)}
          {goal.withdrawal.early && goal.withdrawal.feeCents
            ? `: balance ${formatMoney(goal.withdrawal.amountCents)}, early-withdrawal charge ${formatMoney(goal.withdrawal.feeCents)} (7%), you receive ${formatMoney(goal.withdrawal.payoutCents ?? goal.withdrawal.amountCents)}`
            : `: you receive ${formatMoney(goal.withdrawal.payoutCents ?? goal.withdrawal.amountCents)}, no charge`}
          . This is simulated: with a live partner bank, it would be verified and paid out by them.
        </p>
      )}

      {/* 4. Everything else. */}
      <details className="group rounded-xl border" open={manage} onToggle={(e) => setManage((e.currentTarget as HTMLDetailsElement).open)} data-testid="vault-manage">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Settings2Icon className="size-4 text-muted-foreground" aria-hidden /> Manage
          </span>
          <span className="text-xs text-muted-foreground">auto-save, bank auto-debit, payment growth, history, withdraw</span>
        </summary>
        <div className="space-y-3 border-t p-3">
          {!closed && v.remaining > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">Add extra money</span>
              <CurrencyInput label={`Extra money for ${goal.name}`} cents={extra} onChange={setExtra} className="h-8 w-28" />
              <Button
                size="xs"
                variant="outline"
                disabled={extra <= 0}
                onClick={() => {
                  const key = crypto.randomUUID();
                  apply((p) => recordContribution(p, goal.id, { month: now, date: today, amountCents: extra, kind: "extra", key }));
                  setExtra(0);
                }}
              >
                Add extra
              </Button>
            </div>
          )}
          {!closed && !hasActiveMandate(goal) && v.remaining > 0 && <AutoSave goal={goal} today={today} now={now} update={update} amount={contribution} />}
          {!closed && v.remaining > 0 && <MandatePanel goal={goal} update={update} now={now} suggestedCents={contribution} />}
          {v.remaining > 0 && !closed && <StepUpCard goal={goal} schedule={v.schedule} startMonth={now} update={update} />}

          {!closed && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {v.remaining > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Monthly amount</span>
                  <CurrencyInput
                    label={`${goal.name} monthly amount`}
                    cents={goal.chosenMonthlyCents ?? v.requiredMonthly}
                    onChange={(c) => update((p) => setChosenMonthly(p, goal.id, c))}
                    className="h-8 w-28"
                  />
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Saved before this plan</span>
                <CurrencyInput
                  label={`${goal.name}: saved before this plan`}
                  cents={goal.savedCents}
                  onChange={(c) => update((p) => ({ ...p, goals: p.goals.map((x) => (x.id === goal.id ? { ...x, savedCents: c } : x)) }))}
                  className="h-8 w-28"
                />
              </span>
              {v.remaining > 0 && (
                <Button size="xs" variant="outline" onClick={() => update((p) => setPaused(p, goal.id, !goal.paused))}>
                  {goal.paused ? "Resume payments" : "Pause payments"}
                </Button>
              )}
            </div>
          )}
          {goal.chosenMonthlyCents != null && goal.chosenMonthlyCents < v.minimumMonthly && v.remaining > goal.chosenMonthlyCents && (
            <p className="text-xs text-warning-ink" role="status" data-testid="vault-minimum">
              Below the {formatMoney(v.minimumMonthly)} minimum, so {formatMoney(v.minimumMonthly)} is used.
            </p>
          )}
          {note && (
            <p className="text-xs text-muted-foreground" role="status">
              {note}
            </p>
          )}

          {(goal.contributions ?? []).length > 0 && (
            <div className="text-xs">
              <p className="font-medium">Payment history</p>
              <ul className="mt-1 divide-y rounded-lg border">
                {[...goal.contributions!].reverse().map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 px-2.5 py-1.5">
                    <span>
                      {dateLabel(c.date)} · {c.kind === "extra" ? "Extra" : `For ${monthLabel(c.month)}`}
                    </span>
                    <span className="tabular font-medium">{formatMoney(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1 rounded-lg bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground" data-testid="vault-maturity-total">
            <p>
              By {dateLabel(v.maturityDate)} you’ll have set aside <b className="tabular text-foreground">{formatMoney(v.maturityTotal)}</b> of your own money, locked for {v.lockMonths} months from{" "}
              {monthLabel(v.startMonth)}.
            </p>
            <p data-testid="vault-minimum-rule">
              {v.remaining > 0 && v.remaining < v.minimumMonthly
                ? `Only ${formatMoney(v.remaining)} is left to save, so that’s all this fund needs.`
                : `This fund takes at least ${formatMoney(v.minimumMonthly)} a month, and all your goals together get at least 10% of your income.`}{" "}
              After the lock-in ends, your savings can earn interest from our partner bank. The rate isn’t fixed or guaranteed, and nothing earns interest while the plan is simulated.
            </p>
          </div>

          {!goal.withdrawal &&
            (!withdrawing ? (
              <Button size="xs" variant="ghost" onClick={() => setWithdrawing(true)}>
                {v.matured ? "Withdraw (matured)" : "Request early withdrawal"}
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border bg-background p-2 text-xs">
                {!v.matured ? (
                  <div className="space-y-1 rounded-md bg-warning-soft p-2 text-warning-ink" data-testid="early-withdrawal-quote">
                    <p>
                      This plan matures on {dateLabel(v.maturityDate)}. Breaking the lock early costs a <b>7% wallet charge</b> on your current balance, ends the plan, and gives up the completion reward.
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
            ))}
        </div>
      </details>
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
                → {pays.length === 2 ? `last payment (${monthLabel(lastMonth)})` : "next month"} <b>{formatMoney(next)}</b>
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

/** Extra money for finishing a goal within its lock-in, set from market rates when the lock-in ends. Never a promised amount. */
function RewardCard({ reward }: { reward: CompletionReward | null }) {
  const formatMoney = useFmt();
  if (!reward) return null;
  const earned = reward.status === "earned";
  const tone = earned ? "border-gold/50 bg-gold-soft/60" : reward.status === "on-track" ? "border-brand/25 bg-brand-soft/40" : "border-dashed bg-background/60";
  const Icon = earned ? TrophyIcon : GiftIcon;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs ${tone}`} data-testid="vault-reward" data-status={reward.status}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${earned ? "text-gold-ink" : "text-brand-ink"}`} aria-hidden />
      <div className="space-y-0.5">
        <p className="font-medium">
          {reward.status === "earned"
            ? `Goal completed within its lock-in. You qualify for a completion reward, paid with your savings on ${dateLabel(reward.paysOn)}.`
            : reward.status === "on-track"
              ? `Finish before ${dateLabel(reward.byDate)} and get extra money on top.`
              : reward.status === "missed"
                ? `The lock-in ended before the goal was complete, so there’s no completion reward this time.`
                : `No completion reward: the lock was broken early.`}
        </p>
        {(reward.status === "earned" || reward.status === "on-track") && <p className="text-[11px] text-muted-foreground">{REWARD_RULE}</p>}
      </div>
    </div>
  );
}
