"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addMonths, goalSaved, minLockMonthly, monthLabel, stepUpOf, type Goal, type GoalPlan, type MoneyPlan, type MonthPlan, type Priority, type Purchase } from "@/lib/nexus/budget";
import { api } from "@/lib/nexus/client";
import { Notice, type GoalProduct, type UpdatePlan } from "./money-planner";
import { newId } from "./use-money-plan";
import { CurrencyInput, useCurrency, useFmt } from "./currency";
import { GoalIcon, ProgressRing, ShimmerBar } from "./goal-visuals";
import { VaultDetails } from "./vault-panel";
import { createVaultGoal, localDay, LOCK_OPTIONS, moveFromReserve, reserveThisMonth } from "@/lib/nexus/household";
import { PiggyBankIcon } from "lucide-react";

const PRIORITY_LABEL: Record<Priority, string> = { high: "High priority", medium: "Medium priority", low: "Low priority" };
const field = "h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-sm outline-none focus:border-brand/50";

export function GoalsPanel({
  plan,
  month,
  update,
  products,
  goalPurchases,
  now,
  hasPay = true,
  summary,
  children,
}: {
  plan: MoneyPlan;
  month: MonthPlan;
  update: UpdatePlan;
  products: GoalProduct[];
  goalPurchases: Purchase[];
  now: string;
  hasPay?: boolean;
  /** Shown first: this month's tracker for the goals. */
  summary?: React.ReactNode;
  /** Shown after the goals: the safety net and future savings. */
  children?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="surface space-y-4 p-5" aria-labelledby="goals-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="goals-title" className="text-[15px] font-semibold">
            BUILD · your savings
          </h2>
          <p className="text-xs text-muted-foreground">Your goals first, tracked month by month. Then your safety net and future savings.</p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)} data-testid="add-goal">
            <PlusIcon /> Add a goal
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">1 · Your goals</p>
        {plan.goals.length === 0 && !adding && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="no-goals">
            No goals yet. Add what you’re saving for (a house, a car, a bike, a holiday) and we’ll track it every month.
          </p>
        )}
        {summary}
        <ul className="space-y-3">
          {month.goals.map((gp) => (
            <GoalCard key={gp.goal.id} gp={gp} update={update} hasPay={hasPay} now={now} bought={goalPurchases.find((p) => p.productId === gp.goal.productId)} />
          ))}
        </ul>
        {hasPay && <GoalsReserveCard plan={plan} month={month} update={update} now={now} onAddGoal={() => setAdding(true)} />}
      </div>
      {adding && (
        <GoalForm
          products={products}
          now={now}
          onCancel={() => setAdding(false)}
          reserveCents={plan.goalReserve?.savedCents ?? 0}
          onAdd={(g, useReserve) => {
            update((p) => {
              const next = { ...p, goals: [...p.goals, g] };
              // A new goal can start with the Goals reserve (the part of the 10% earlier goals didn't need).
              return useReserve ? moveFromReserve(next, g.id, localDay()).plan : next;
            });
            setAdding(false);
          }}
        />
      )}
      {children}
    </section>
  );
}

function GoalCard({ gp, update, bought, hasPay, now }: { gp: GoalPlan; update: UpdatePlan; bought?: Purchase; hasPay: boolean; now: string }) {
  const formatMoney = useFmt();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const g = gp.goal;
  const locked = Boolean(g.lockMonths);
  const progress = g.targetCents > 0 ? Math.min(1, goalSaved(g) / g.targetCents) : 0;
  const setGoal = (patch: Partial<Goal>) => update((p) => ({ ...p, goals: p.goals.map((x) => (x.id === g.id ? { ...x, ...patch } : x)) }));
  const negotiate = async () => {
    setBusy(true);
    try {
      const { session, action } = await api<{ session: { id: string }; action: { type: string } }>("/api/sessions", {
        json: { text: g.name, via: "chat", budgetCents: g.targetCents },
      });
      router.push(`/negotiations/${session.id}${action.type === "negotiate" ? "?go=1" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t start the negotiation");
      setBusy(false);
    }
  };
  return (
    <li className="lift space-y-3 rounded-xl border bg-card p-4 transition" data-testid="goal-card">
      <div className="flex items-start gap-3">
        <GoalIcon name={g.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{g.name}</p>
          {locked ? (
            <p className="text-xs text-muted-foreground">
              {PRIORITY_LABEL[g.priority]} · {g.lockMonths}-month lock-in
            </p>
          ) : (
            <>
              <p className="tabular text-xs text-muted-foreground">
                {formatMoney(g.targetCents)} by {monthLabel(g.dueMonth)} · {PRIORITY_LABEL[g.priority]}
              </p>
              <p className="tabular mt-1 text-sm">
                <b>{formatMoney(goalSaved(g))}</b> <span className="text-muted-foreground">saved of {formatMoney(g.targetCents)}</span>
              </p>
            </>
          )}
        </div>
        {!locked && <ProgressRing value={progress} size={60} />}
        <Button variant="ghost" size="icon" aria-label={`Remove ${g.name}`} onClick={() => update((p) => ({ ...p, goals: p.goals.filter((x) => x.id !== g.id) }))}>
          <Trash2Icon />
        </Button>
      </div>
      {!locked && (
      <div className="space-y-1.5">
        <ShimmerBar value={progress} label={`${g.name}: saved so far`} done={progress >= 1} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Saved before this plan</span>
          <CurrencyInput label={`${g.name}: saved before this plan`} cents={g.savedCents} onChange={(c) => setGoal({ savedCents: c })} className="h-8 w-28" />
        </div>
      </div>
      )}
      {bought ? (
        <Notice tone="success">Bought for {formatMoney(bought.totalCents)} with PayPal Nexus, paid from this goal’s savings.</Notice>
      ) : !hasPay && gp.status !== "done" ? (
        <p className="text-sm text-muted-foreground">
          To reach it by {monthLabel(g.dueMonth)}, save about <b className="tabular">{formatMoney(gp.neededCents)}</b> a month. Add your pay with Edit to check it fits.
        </p>
      ) : gp.status === "done" ? (
        locked ? null : <Notice tone="success">Goal reached. You’ve saved enough.</Notice>
      ) : gp.status === "on-track" && gp.monthlyCents > gp.neededCents && gp.reachMonth ? (
        <p className="tabular text-sm" data-testid="goal-monthly">
          Save <b>{formatMoney(gp.monthlyCents)}</b> a month: more than the {formatMoney(gp.neededCents)} it needs, because at least 10% of your income goes to goals. You’ll reach it by{" "}
          <b>{monthLabel(gp.reachMonth)}</b>, sooner than {monthLabel(g.dueMonth)}.
        </p>
      ) : gp.status === "on-track" && locked ? null : gp.status === "on-track" && stepUpOf(g) ? (
        <p className="tabular text-sm" data-testid="goal-monthly">
          Save <b>{formatMoney(gp.monthlyCents)}</b> this month, then 5% more every {stepUpOf(g)!.every} to reach it by {monthLabel(g.dueMonth)}.
        </p>
      ) : gp.status === "on-track" ? (
        <p className="tabular text-sm" data-testid="goal-monthly">
          Save <b>{formatMoney(gp.monthlyCents)}</b> a month to reach it by {monthLabel(g.dueMonth)}.
        </p>
      ) : gp.status === "behind" ? (
        <Notice tone="warning">
          It needs {formatMoney(gp.neededCents)} a month, but only {formatMoney(gp.monthlyCents)} is free. At that pace you’ll reach it in {monthLabel(gp.reachMonth!)}.
        </Notice>
      ) : (
        <Notice tone="error">Your savings are used up by more important goals. It needs {formatMoney(gp.neededCents)} a month: lower your ENJOY limits, give it a later date, or lower its amount.</Notice>
      )}
      {g.lockMonths ? <VaultDetails goal={g} monthlyCents={gp.monthlyCents} reachMonth={gp.reachMonth} update={update} now={now} /> : null}
      <div className="flex flex-wrap gap-2">
        {/* Locked goals record their monthly amount in the savings plan above; this button is for goals without a lock-in. */}
        {hasPay && gp.monthlyCents > 0 && !bought && !g.lockMonths && (
          <Button size="sm" variant="outline" onClick={() => setGoal({ savedCents: g.savedCents + gp.monthlyCents })}>
            Add this month’s {formatMoney(gp.monthlyCents)}
          </Button>
        )}
        {g.productId && !bought && (
          <Button size="sm" variant={gp.status === "done" ? "default" : "outline"} onClick={negotiate} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            {gp.status === "done" ? "Get it now" : "Check today’s best price"}
          </Button>
        )}
      </div>
    </li>
  );
}

function GoalForm({ products, now, onAdd, onCancel, reserveCents = 0 }: { products: GoalProduct[]; now: string; onAdd: (g: Goal, useReserve: boolean) => void; onCancel: () => void; reserveCents?: number }) {
  const [useReserve, setUseReserve] = useState(true);
  const formatMoney = useFmt();
  const formatMin = formatMoney(minLockMonthly(useCurrency()));
  const [kind, setKind] = useState<"product" | "other">("product");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [saved, setSaved] = useState(0);
  const [due, setDue] = useState(addMonths(now, 5));
  const [lock, setLock] = useState<number | "none">(12);
  const [priority, setPriority] = useState<Priority>("medium");
  const product = products.find((p) => p.id === productId);
  const goalName = kind === "product" ? (product?.name ?? "") : name.trim();
  const valid = goalName.length > 0 && target > 0 && /^\d{4}-\d{2}$/.test(due);
  return (
    <form
      className="space-y-3 rounded-xl border border-brand/40 bg-brand-soft/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const base = { id: newId(), name: goalName, targetCents: target, savedCents: saved, priority, productId: kind === "product" ? productId : null };
        onAdd(lock === "none" ? { ...base, dueMonth: due < now ? now : due } : createVaultGoal({ ...base, lockMonths: lock }, now), reserveCents > 0 && useReserve);
      }}
      aria-label="New goal"
    >
      <div className="flex gap-2" role="group" aria-label="Goal type">
        {(["product", "other"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "product" ? "Something to buy" : "Another goal"}
          </Button>
        ))}
      </div>
      {kind === "product" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Product</span>
          <select
            className={field}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              if (p) setTarget(p.fromCents);
            }}
            data-testid="goal-product"
          >
            <option value="">Choose a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (from {formatMoney(p.fromCents)})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Goal name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="e.g. Bike, Trip to Goa" data-testid="goal-name" />
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Amount needed</p>
          <CurrencyInput label="Amount needed" cents={target} onChange={setTarget} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Saved so far</p>
          <CurrencyInput label="Saved so far" cents={saved} onChange={setSaved} />
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Savings plan length</span>
          <select className={field} value={String(lock)} onChange={(e) => setLock(e.target.value === "none" ? "none" : Number(e.target.value))} data-testid="goal-lock">
            {LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m < 12 ? `${m} months` : `${m / 12} year${m === 12 ? "" : "s"}`} (lock-in)
              </option>
            ))}
            <option value="none">No lock-in: pick a date</option>
          </select>
          <span className="block text-[11px] text-muted-foreground">Locked plans need at least {formatMin} a month. After the lock-in, savings can earn interest from our partner bank (not fixed). Finish a goal within its lock-in and you get extra money on top, based on market rates. Breaking the lock early costs a 7% wallet charge.</span>
        </label>
        {lock === "none" && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Reach it by</span>
            <input type="month" className={field} value={due} min={now} onChange={(e) => setDue(e.target.value)} data-testid="goal-due" />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Priority</span>
          <select className={field} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      {reserveCents > 0 && (
        <label className="flex items-start gap-2 rounded-lg bg-gold-soft/50 px-3 py-2 text-xs">
          <input type="checkbox" className="mt-0.5 size-4" checked={useReserve} onChange={(e) => setUseReserve(e.target.checked)} data-testid="goal-use-reserve" />
          <span>
            Start this goal with your <b>Goals reserve</b> ({formatMoney(reserveCents)}), the part of your 10% that earlier goals didn’t need.
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid} data-testid="save-goal">
          Add goal
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Goals reserve: 10% of income always goes to goals. What the goals don't
 * need this month is kept here for them, and can be moved into any goal.
 */
function GoalsReserveCard({ plan, month, update, now, onAddGoal }: { plan: MoneyPlan; month: MonthPlan; update: UpdatePlan; now: string; onAddGoal: () => void }) {
  const formatMoney = useFmt();
  const saved = plan.goalReserve?.savedCents ?? 0;
  const thisMonth = reserveThisMonth(plan, month, now);
  const open = plan.goals.filter((g) => !g.withdrawal && g.targetCents - goalSaved(g) > 0);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState<string | null>(null);
  if (saved <= 0 && thisMonth.cents <= 0) return null;
  const goalId = open.some((g) => g.id === target) ? target : (open[0]?.id ?? "");
  const goal = open.find((g) => g.id === goalId);
  const canMove = goal ? Math.min(saved, goal.targetCents - goalSaved(goal)) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-gold/40 bg-gold-soft/40 p-4" data-testid="goals-reserve">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <PiggyBankIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
          <div>
            <p className="font-medium">Goals reserve</p>
            <p className="text-xs text-muted-foreground">The part of your 10% for goals that your goals didn’t need yet. It stays with your goals; it’s never moved to spending.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="tabular text-xl font-semibold" data-testid="goals-reserve-saved">
            {formatMoney(saved)}
          </p>
          <p className="tabular text-[11px] text-muted-foreground">
            {thisMonth.cents > 0 ? `${thisMonth.recorded ? "+" : "adding "}${formatMoney(thisMonth.cents)} this month` : "nothing to add this month"}
          </p>
        </div>
      </div>
      {saved > 0 &&
        (open.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>Move it into</span>
            <select className="h-8 rounded-md border bg-background px-1.5" value={goalId} onChange={(e) => setTarget(e.target.value)} aria-label="Goal to move the reserve into" data-testid="goals-reserve-goal">
              {open.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <Button
              size="xs"
              disabled={canMove <= 0}
              onClick={() => {
                update((p) => moveFromReserve(p, goalId, localDay()).plan);
                setNote(`Moved ${formatMoney(canMove)} into ${goal?.name}.`);
              }}
              data-testid="goals-reserve-move"
            >
              Move {formatMoney(canMove)}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>All your goals are fully saved. Your next goal can start with this money.</span>
            <Button size="xs" variant="outline" onClick={onAddGoal}>
              <PlusIcon /> Add a goal
            </Button>
          </div>
        ))}
      {note && (
        <p className="text-xs font-medium text-success-ink" role="status">
          {note}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">Virtual savings planned in this app; no money moves from your bank.</p>
    </div>
  );
}
