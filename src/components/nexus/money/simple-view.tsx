"use client";

import { CheckIcon, PencilIcon, PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addMonths, goalFloor, goalSaved, monthLabel, type BudgetItem, type MoneyPlan, type MonthPlan, type MonthSpending } from "@/lib/nexus/budget";
import { allocation, autoSaveOf, categoryStatuses, emergencyStatus, limitOf, localDay, nextAutoPay, setAutoPay, spentToday, todayAllowance, type AlertLevel, type TodayAllowance } from "@/lib/nexus/household";
import { buildPots, planPriorities } from "@/lib/nexus/savings-policy";
import { GoalIcon, ShimmerBar } from "./goal-visuals";
import { BuildPots, FamilyNotes, PRIORITY_COLOR, PriorityDonut, SavingsRate } from "./priorities";
import { CurrencyInput, useFmt } from "./currency";
import type { UpdatePlan } from "./money-planner";
import { newId } from "./use-money-plan";

const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

// ----------------------------------------------------------------------------
// 1. Overview: one number to live by, and where the month's money goes.
// ----------------------------------------------------------------------------

export function Overview({ plan, month, spending, now, onEdit }: { plan: MoneyPlan; month: MonthPlan; spending: MonthSpending; now: string; onEdit: () => void }) {
  const formatMoney = useFmt();
  const d = new Date();
  const a = allocation(plan, month);
  const pri = planPriorities(plan, month);
  // Today's spending money across ENJOY, recalculated from what's left every day.
  const todayMap = spentToday(plan, localDay(d));
  const enjoyRows = plan.bills.filter((b) => b.kind === "want");
  const t = enjoyRows.reduce(
    (acc, b) => {
      const x = todayAllowance(limitOf(b), spending.byBill.get(b.id) ?? 0, todayMap.get(b.id) ?? 0, d.getDate(), daysIn(d));
      return { allow: acc.allow + x.allowanceCents, spent: acc.spent + x.spentTodayCents, tomorrow: acc.tomorrow + x.fromTomorrowCents };
    },
    { allow: 0, spent: 0, tomorrow: 0 },
  );
  const daysLeft = daysIn(d) - d.getDate() + 1;

  return (
    <section className="surface space-y-5 p-5" aria-labelledby="overview-title" data-testid="money-overview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{monthLabel(now)} · your personalised plan</p>
          <div data-testid="allowance">
            <h2 id="overview-title" className="mt-1 text-xl font-semibold sm:text-2xl">
              {pri.live === 0 ? (
                "Your plan so far"
              ) : enjoyRows.length ? (
                <>
                  You can spend <span className="tabular text-brand-ink">{formatMoney(Math.max(0, t.allow - t.spent))}</span> more today
                </>
              ) : (
                "Your plan this month"
              )}
            </h2>
            {pri.live === 0 && <p className="mt-1 text-xs text-muted-foreground">Add your rent and EMIs to see what you can spend each day.</p>}
            {pri.live > 0 && enjoyRows.length > 0 && (
              <p className="tabular mt-1 text-xs text-muted-foreground" data-testid="today-summary">
                {formatMoney(t.spent)} spent today of {formatMoney(t.allow)} · then about {formatMoney(t.tomorrow)} a day · {daysLeft} days left
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} data-testid="personalise">
          <PencilIcon /> Edit
        </Button>
      </div>

      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Monthly income</span>
        <b className="tabular" data-testid="dash-income">
          {formatMoney(a.income)}
        </b>
      </div>
      <PriorityDonut p={pri} />
      <FamilyNotes plan={plan} enjoy={pri.enjoy} />
      <SavingsRate p={pri} />
      {pri.overCeiling > 0 && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-ink" role="status">
          Your goals ask for {formatMoney(pri.committed)} a month, more than half your income. We keep savings at 50% at most: give a goal more time or lower its target.
        </p>
      )}

      {pri.status !== "shortfall" && a.explanations.map((x) => (
        <p key={x} className="rounded-xl bg-error-soft px-3 py-2 text-xs text-error-ink" role="status">
          {x}
        </p>
      ))}
    </section>
  );
}

// ----------------------------------------------------------------------------
// 2. Limits: each category, what's left, and a one-line way to log spending.
// ----------------------------------------------------------------------------

const BAR: Record<AlertLevel, string> = { fine: "bg-brand", half: "bg-brand", reminder: "bg-warning", warning: "bg-warning", exhausted: "bg-error", over: "bg-error" };

export function Limits({ plan, spending, update, now }: { plan: MoneyPlan; spending: MonthSpending; update: UpdatePlan; now: string }) {
  const formatMoney = useFmt();
  const d = new Date();
  const today = localDay(d);
  const statuses = categoryStatuses(plan, spending, d.getDate(), daysIn(d));
  const todayMap = spentToday(plan, today);
  const logFor = (billId: string) => {
    setSource(billId);
    document.querySelector<HTMLInputElement>("#log-spend-amount input")?.focus();
  };
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(0);
  const [source, setSource] = useState(plan.bills.find((b) => b.kind === "want")?.id ?? plan.bills[0]?.id ?? "");
  if (!statuses.length) return null;

  const groups = [
    { title: "LIVE · bills and essentials", rows: statuses.filter((s) => (s.item.kind ?? "need") === "need") },
    { title: "ENJOY · on yourself", rows: statuses.filter((s) => s.item.kind === "want") },
  ].filter((g) => g.rows.length);
  const recent = plan.expenses.filter((e) => e.date.startsWith(now)).slice(-3).reverse();

  return (
    <section className="surface space-y-5 p-5" aria-labelledby="limits-title" data-testid="category-limits">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="limits-title" className="text-[15px] font-semibold">
            Spend up to this much
          </h2>
          <p className="text-xs text-muted-foreground">Your limits for {monthLabel(now)}, worked out from your own income and costs. Auto-pay records a bill in your plan on its day; it doesn’t move money from your bank.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)} aria-pressed={editing}>
          {editing ? "Done" : "Change limits"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title} className="space-y-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.title}</p>
            <ul className="space-y-3">
              {g.rows.map(({ item, status }) => {
                const over = status.remainingCents < 0;
                // A bill (LIVE) paid in full is good news, not a warning.
                const paid = (item.kind ?? "need") === "need" && status.limitCents > 0 && status.remainingCents === 0;
                return (
                  <li key={item.id} className="space-y-1" data-testid={`limit-${item.name}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{item.name}</span>
                      {editing && item.kind === "want" ? (
                        <CurrencyInput
                          label={`${item.name} limit`}
                          cents={item.limitCents ?? item.amountCents}
                          onChange={(c) => update((p) => ({ ...p, bills: p.bills.map((x) => (x.id === item.id ? { ...x, limitCents: c } : x)) }))}
                          className="h-8 w-28"
                        />
                      ) : (
                        <span className={`tabular shrink-0 ${over ? "font-medium text-error-ink" : ""}`}>
                          {paid ? (
                            <span className="font-medium text-success-ink">Paid {formatMoney(status.limitCents)}</span>
                          ) : (
                            <>
                              {over ? `${formatMoney(-status.remainingCents)} over` : `${formatMoney(status.remainingCents)} left`}
                              <span className="text-muted-foreground"> of {formatMoney(status.limitCents)}</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div
                      className="h-1.5 rounded-full bg-secondary"
                      role="progressbar"
                      aria-label={`${item.name}: share of limit used`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round((Number.isFinite(status.pctUsed) ? status.pctUsed : 1) * 100))}
                    >
                      <div className={`h-1.5 rounded-full ${paid ? "bg-success" : BAR[status.level]}`} style={{ width: `${Math.min(100, status.pctUsed * 100)}%` }} />
                    </div>
                    {item.kind === "want" && (
                      <TodayLine
                        name={item.name}
                        x={todayAllowance(status.limitCents, status.spentCents, todayMap.get(item.id) ?? 0, d.getDate(), daysIn(d))}
                        weekCents={status.weekCents}
                        onLog={() => logFor(item.id)}
                      />
                    )}
                    {(item.kind ?? "need") === "need" && (editing ? <AutoPayControl item={item} update={update} /> : item.autoPay && <AutoPayLine item={item} plan={plan} today={today} />)}
                    {!paid && status.level !== "fine" && status.level !== "half" && (
                      <p className={`text-xs ${status.level === "reminder" || status.level === "warning" ? "text-warning-ink" : "text-error-ink"}`} role="status">
                        {status.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-2 border-t pt-4"
        aria-label="Log spending"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount <= 0 || !source) return;
          update((p) => ({ ...p, expenses: [...p.expenses, { id: newId(), date: today, amountCents: amount, note: "", source: { kind: "bill", billId: source } }] }));
          setAmount(0);
        }}
      >
        <div className="space-y-1 text-sm" id="log-spend-amount">
          <p className="text-xs text-muted-foreground">Spent</p>
          <CurrencyInput label="Amount spent" cents={amount} onChange={setAmount} className="h-9 w-32" />
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">On</span>
          <select className="h-9 rounded-lg border bg-background px-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)} data-testid="spend-category">
            {plan.bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={amount <= 0} data-testid="log-spend">
          <PlusIcon /> Add
        </Button>
      </form>
      {recent.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Recent spending">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {e.date.slice(8)} {monthLabel(now).slice(0, 3)} · {plan.bills.find((b) => e.source.kind === "bill" && b.id === e.source.billId)?.name ?? "Spending"}
              </span>
              <span className="flex items-center gap-1">
                <span className="tabular text-foreground">{formatMoney(e.amountCents)}</span>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${formatMoney(e.amountCents)} spending`} onClick={() => update((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== e.id) }))}>
                  <Trash2Icon />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TodayLine({ name, x, weekCents, onLog }: { name: string; x: TodayAllowance; weekCents: number; onLog: () => void }) {
  const formatMoney = useFmt();
  const over = x.leftTodayCents < 0;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]" data-testid={`today-${name}`}>
      <span className={`tabular ${over ? "text-warning-ink" : "text-muted-foreground"}`}>
        Today {formatMoney(x.spentTodayCents)} of {formatMoney(x.allowanceCents)}
        {over ? ` · ${formatMoney(-x.leftTodayCents)} over today` : ""} · then {formatMoney(x.fromTomorrowCents)} a day · {formatMoney(weekCents)} a week
      </span>
      <Button variant="ghost" size="xs" onClick={onLog} aria-label={`Log spending on ${name}`}>
        <PlusIcon /> Log
      </Button>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function AutoPayLine({ item, plan, today }: { item: BudgetItem; plan: MoneyPlan; today: string }) {
  if (!item.autoPay) return null;
  const month = today.slice(0, 7);
  const paid = plan.expenses.find((e) => e.id === `auto-${item.id}-${month}`);
  return (
    <p className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`autopay-${item.name}`}>
      <RepeatIcon className="size-3" aria-hidden />
      {paid ? `Auto-paid ${shortDate(paid.date)} · next ${shortDate(nextAutoPay(item.autoPay.day, today, item.autoPay.lastMonth))}` : `Auto-pay on the ${ordinal(item.autoPay.day)} · next ${shortDate(nextAutoPay(item.autoPay.day, today, item.autoPay.lastMonth))}`}
    </p>
  );
}

function AutoPayControl({ item, update }: { item: BudgetItem; update: UpdatePlan }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={Boolean(item.autoPay)} onChange={(e) => update((p) => setAutoPay(p, item.id, e.target.checked ? (item.autoPay?.day ?? 1) : null))} data-testid={`autopay-toggle-${item.name}`} />
        Auto-pay each month
      </label>
      {item.autoPay && (
        <label className="flex items-center gap-1">
          on day
          <select className="h-7 rounded-md border bg-background px-1" value={item.autoPay.day} onChange={(e) => update((p) => setAutoPay(p, item.id, Number(e.target.value)))} aria-label={`${item.name} auto-pay day`}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. Emergency fund, as one line above the goals.
// ----------------------------------------------------------------------------

const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;

/** This month, goal by goal: planned, saved, what's due, progress and finish date. */
export function GoalsThisMonth({ month, now, plan }: { month: MonthPlan; now: string; plan: MoneyPlan }) {
  const formatMoney = useFmt();
  if (!month.goals.length) return null;
  const floor = goalFloor(plan.salaryCents, plan.goals);
  const rows = month.goals.map((gp) => {
    const g = gp.goal;
    const recorded = (g.contributions ?? []).filter((c) => c.month === now).reduce((t, c) => t + c.amountCents, 0);
    const saved = goalSaved(g);
    const planned = gp.monthlyCents;
    // What this month should get: the planned amount, or what the goal needs when nothing is free for it.
    const aim = planned > 0 ? planned : gp.neededCents;
    const step = g.lockMonths && g.startMonth ? Math.min(g.lockMonths, Math.max(1, idx(now) - idx(g.startMonth) + 1)) : null;
    const state =
      gp.status === "done" ? { word: "Reached", cls: "bg-success-soft text-success-ink", good: true }
      : g.paused ? { word: "Paused", cls: "bg-secondary text-foreground", good: false }
      : aim > 0 && recorded >= aim ? { word: "Saved this month", cls: "bg-success-soft text-success-ink", good: true }
      : planned === 0 ? { word: "No money left for it", cls: "bg-error-soft text-error-ink", good: false }
      : { word: `Due ${formatMoney(Math.max(0, planned - recorded))}`, cls: "bg-warning-soft text-warning-ink", good: false };
    return { gp, g, recorded, saved, planned, step, state };
  });
  const plannedAll = rows.reduce((t, r) => t + r.planned, 0);
  const recordedAll = rows.reduce((t, r) => t + r.recorded, 0);
  return (
    <div className="space-y-2 rounded-xl bg-secondary/60 p-3" data-testid="goals-tracker">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{monthLabel(now)}</span>
        <span className="tabular text-muted-foreground">
          <b className="text-foreground">{formatMoney(recordedAll)}</b> saved this month · {formatMoney(plannedAll)} planned
        </span>
      </p>
      {floor > 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid="goal-floor">
          At least 10% of your income (<b className="tabular text-foreground">{formatMoney(floor)}</b>) goes to your goals each month, more when they need it.
        </p>
      )}
      <ul className="divide-y divide-border/70">
        {rows.map(({ gp, g, recorded, saved, planned, step, state }) => (
          <li key={g.id} className="grid grid-cols-1 gap-1.5 py-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4" data-testid={`tracker-${g.name}`}>
            <div className="flex min-w-0 items-center gap-2.5">
              <GoalIcon name={g.name} className="size-8 rounded-lg [&_svg]:size-4" />
              <div className="min-w-0">
              <p className="truncate text-sm font-medium">{g.name}</p>
              <p className="tabular text-[11px] text-muted-foreground">
                {planned < gp.neededCents && gp.status !== "done" ? `Needs ${formatMoney(gp.neededCents)} a month · ${formatMoney(planned)} fits` : `${formatMoney(planned)} a month`}
                {step ? ` · month ${step} of ${g.lockMonths}` : ""}
                {g.mandate?.status === "active" ? ` · auto-debit on day ${g.mandate.day}` : autoSaveOf(g) ? ` · auto-save on day ${autoSaveOf(g)!.day}` : ""}
                {gp.reachMonth ? ` · saved by ${monthLabel(gp.reachMonth)}` : planned === 0 && gp.status !== "done" ? "" : ` · saved by ${monthLabel(g.dueMonth)}`}
                {g.lockMonths && g.startMonth ? ` · unlocks ${monthLabel(addMonths(g.startMonth, g.lockMonths))}` : ""}
              </p>
              </div>
            </div>
            <div className="space-y-1">
              <ShimmerBar value={g.targetCents ? saved / g.targetCents : 0} label={`${g.name}: progress`} done={gp.status === "done"} className="h-2 bg-background" />
              <p className="tabular text-[11px] text-muted-foreground">
                {formatMoney(saved)} of {formatMoney(g.targetCents)}
                {recorded > 0 ? ` · ${formatMoney(recorded)} this month` : ""}
              </p>
            </div>
            <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${state.cls} ${state.good ? "pop-in" : ""}`}>
              {state.good && <CheckIcon className="size-3" aria-hidden />}
              {state.word}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rest of BUILD: safety net and future savings, after the goals. */
export function BuildSummary({ plan, month, now }: { plan: MoneyPlan; month: MonthPlan; now: string }) {
  const formatMoney = useFmt();
  const pri = planPriorities(plan, month);
  const pots = buildPots(pri.build, month.emergencyCents, month.goalsCents, plan.profile?.children ?? 0).filter((x) => x.key !== "goals");
  const rest = pots.reduce((t, x) => t + x.cents, 0);
  const e = plan.emergency ? emergencyStatus(plan, now) : null;
  return (
    <div className="space-y-3 border-t pt-4" data-testid="build-summary">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">2 · Safety net and future</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-xl bg-secondary/60 p-3">
          <p className="text-sm font-medium">
            Each month <span className="tabular">{formatMoney(rest)}</span> goes to
          </p>
          <BuildPots pots={pots} testId="build-pots" />
        </div>
        {e && plan.emergency && (
          <div className="space-y-1.5 rounded-xl bg-secondary/60 p-3" data-testid="emergency-summary">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">Emergency fund</span>
              {e.target > 0 && (
                <span className="tabular">
                  {formatMoney(e.saved)} <span className="text-muted-foreground">of {formatMoney(e.target)}</span>
                </span>
              )}
            </div>
            {e.target === 0 && <p className="text-xs text-muted-foreground">Your target is set once you add rent and EMIs.</p>}
            <div className="h-1.5 rounded-full bg-background" aria-hidden>
              <div className="h-1.5 rounded-full" style={{ width: `${e.progress * 100}%`, background: PRIORITY_COLOR.build }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatMoney(e.monthly)} a month · {e.targetMonths} months of essentials
              {e.completionMonth ? ` · done by ${monthLabel(e.completionMonth)}` : ""}
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Each month the emergency fund is paid first, then your goals, then the rest. Separate virtual pots, planned in this app: no money is moved, deposited or locked.</p>
    </div>
  );
}
