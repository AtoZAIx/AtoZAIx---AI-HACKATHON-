"use client";

import { CircleCheckIcon, InfoIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  monthLabel,
  type MoneyPlan,
  type MonthPlan,
  type MonthSpending,
} from "@/lib/nexus/budget";
import {
  applyProposals,
  comparePlans,
  emergencyStatus,
  goalProposals,
  proposeLifeChange,
  setEmergency,
  targetChecks,
  type LifeChange,
} from "@/lib/nexus/household";
import { answerMoneyQuestion, EXAMPLE_QUESTIONS } from "@/lib/nexus/money-questions";
import { CurrencyInput, useFmt } from "./currency";
import type { UpdatePlan } from "./money-planner";

/** Validated categorical hues (dataviz validator, light surface) for the five parts of income. */
const PART_COLOR = { essentials: "var(--chart-2)", lifestyle: "var(--chart-4)", protection: "var(--chart-1)", goals: "var(--chart-3)", reserve: "#a1a1aa" } as const;
const field = "h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-sm outline-none focus:border-brand/50";

function Card({ id, title, description, children, testId }: { id: string; title: string; description?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="surface space-y-4 p-5" aria-labelledby={id} data-testid={testId}>
      <div>
        <h2 id={id} className="text-[15px] font-semibold">
          {title}
        </h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T | null | undefined; options: Array<[T, string]>; onChange: (v: T | null) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <Button key={String(v)} type="button" size="sm" variant={value === v ? "default" : "outline"} aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>
            {text}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-lg font-semibold" data-testid={testId}>
        {value}
      </dd>
      {sub && <dd className="text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  );
}

// ======================================================================
// Emergency fund
// ======================================================================

export function EmergencyCard({ plan, update, now }: { plan: MoneyPlan; update: UpdatePlan; now: string }) {
  const formatMoney = useFmt();
  const e = emergencyStatus(plan, now);
  if (e.essentialsMonthly === 0)
    return (
      <Card id="emergency-title" title="Emergency fund" description="Your safety net, kept separate from goals." testId="emergency-card">
        <p className="text-sm text-muted-foreground">Add your rent and EMIs first. Your emergency fund is a few months of those must-pay costs, so we can’t size it without them.</p>
      </Card>
    );
  return (
    <Card id="emergency-title" title="Emergency fund" description="Your safety net, kept separate from goals. Only money you put here counts as emergency savings." testId="emergency-card">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Essentials a month" value={formatMoney(e.essentialsMonthly)} />
        <Stat label={`${e.targetMonths}-month target`} value={formatMoney(e.target)} sub={`3 months ${formatMoney(e.target3)} · 6 months ${formatMoney(e.target6)}`} />
        <Stat label="Saved" value={formatMoney(e.saved)} sub={`${Math.round(e.progress * 100)}% of target`} testId="emergency-saved" />
        <Stat label="Still needed" value={formatMoney(e.remaining)} sub={e.completionMonth ? `Done by ${monthLabel(e.completionMonth)}` : "Set a monthly amount"} />
      </dl>
      <div className="h-2 rounded-full bg-secondary" aria-hidden>
        <div className="h-2 rounded-full" style={{ width: `${e.progress * 100}%`, background: PART_COLOR.protection }} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Choice label="Target" value={String(e.targetMonths)} options={[["3", "3 months"], ["6", "6 months"]]} onChange={(v) => update((p) => setEmergency(p, { targetMonths: Number(v ?? 3) }))} />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Saved so far</p>
          <CurrencyInput label="Emergency fund saved" cents={e.saved} onChange={(c) => update((p) => setEmergency(p, { savedCents: c }))} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Each month</p>
          <CurrencyInput label="Emergency fund each month" cents={plan.emergency?.monthlyCents ?? 0} onChange={(c) => update((p) => setEmergency(p, { monthlyCents: c }))} />
          <p className="text-[11px] text-muted-foreground">Suggested {formatMoney(e.suggestedMonthly)} (one year).</p>
        </div>
      </div>
    </Card>
  );
}

// ======================================================================
// Goal priorities (approval required)
// ======================================================================

export function GoalPriorities({ plan, month, update }: { plan: MoneyPlan; month: MonthPlan; update: UpdatePlan }) {
  const formatMoney = useFmt();
  const g = goalProposals(plan, month);
  if (!g.proposals.length) return null;
  const dated = g.proposals.filter((p) => p.proposedDue);
  return (
    <Card id="priorities-title" title="Your goals need more than your savings" description="Nothing changes until you approve it." testId="goal-priorities">
      <p className="text-sm">
        Goals need <b className="tabular">{formatMoney(g.required)}</b> a month; <b className="tabular">{formatMoney(g.shortfall)}</b> is missing. Higher-priority goals are funded first.
      </p>
      <ul className="space-y-2">
        {g.proposals.map((p) => (
          <li key={p.goalId} className="rounded-xl border p-3 text-sm">
            {p.explanation}
            {p.proposedDue && <span className="block text-xs text-muted-foreground">Proposed new date: {monthLabel(p.proposedDue)} (was {monthLabel(p.currentDue)})</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Other options: lower a target, pause a goal, reduce a lifestyle limit, or add more when your income rises.</p>
      {dated.length > 0 && (
        <Button size="sm" onClick={() => update((p) => applyProposals(p, dated.map((x) => ({ goalId: x.goalId, dueMonth: x.proposedDue! }))))} data-testid="approve-dates">
          Approve the new dates
        </Button>
      )}
    </Card>
  );
}

// ======================================================================
// Life changes
// ======================================================================

type ChangeKind = LifeChange["type"];
const CHANGES: Array<[ChangeKind, string, string | null]> = [
  ["salary", "My salary changed", "New monthly take-home salary"],
  ["rent", "My rent changed", "New monthly rent"],
  ["loan", "I took a new loan", "Monthly EMI"],
  ["medical", "New regular medical costs", "Monthly cost"],
  ["relocation", "I’m moving", "New monthly rent"],
  ["marriage", "I got married", null],
  ["child", "We’re having a child", null],
  ["dependent", "Someone new depends on me", null],
];

export function LifeChanges({ plan, update, now }: { plan: MoneyPlan; update: UpdatePlan; now: string }) {
  const formatMoney = useFmt();
  const [kind, setKind] = useState<ChangeKind>("salary");
  const [amount, setAmount] = useState(0);
  const [shown, setShown] = useState(false);
  const meta = CHANGES.find((c) => c[0] === kind)!;
  const change: LifeChange | null =
    kind === "salary"
      ? { type: "salary", newMonthlyCents: amount }
      : kind === "rent" || kind === "relocation"
        ? { type: kind, newRentCents: amount }
        : kind === "loan"
          ? { type: "loan", name: "New loan EMI", emiCents: amount }
          : kind === "medical"
            ? { type: "medical", monthlyCents: amount }
            : { type: kind };
  const needsAmount = meta[2] !== null;
  const proposal = change && (!needsAmount || amount > 0) ? proposeLifeChange(plan, change) : null;
  const cmp = proposal ? comparePlans(plan, proposal.plan, now) : null;
  return (
    <Card id="life-title" title="Something changed in your life?" description="See the effect on your plan first. Nothing changes until you apply it." testId="life-changes">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">What changed</span>
          <select
            className={field}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ChangeKind);
              setShown(false);
            }}
          >
            {CHANGES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {needsAmount ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{meta[2]}</p>
            <CurrencyInput label={meta[2]!} cents={amount} onChange={setAmount} />
          </div>
        ) : (
          <span />
        )}
        <Button variant="outline" onClick={() => setShown(true)} disabled={!proposal} data-testid="preview-change">
          See the effect
        </Button>
      </div>
      {shown && proposal && cmp && (
        <div className="space-y-3" data-testid="life-preview">
          <div className="overflow-x-auto rounded-xl border" role="region" aria-label="Plan before and after" tabIndex={0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Part</th>
                  <th className="px-3 font-medium">Now</th>
                  <th className="px-3 font-medium">After</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cmp.rows.map((r) => (
                  <tr key={r.label}>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="tabular px-3">{formatMoney(r.before)}</td>
                    <td className={`tabular px-3 ${r.after !== r.before ? "font-semibold" : ""}`}>{formatMoney(r.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cmp.goalChanges.map((g) => (
            <p key={g.name} className="text-sm">
              {g.name}: {g.before} → {g.after}
            </p>
          ))}
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {proposal.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                update(() => proposal.plan);
                setShown(false);
              }}
              data-testid="apply-change"
            >
              Apply these changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShown(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ======================================================================
// Coach chat (in-browser, from your own numbers)
// ======================================================================

export function CoachChat({ plan, spending, now }: { plan: MoneyPlan; spending: MonthSpending; now: string }) {
  const [q, setQ] = useState("");
  const [answers, setAnswers] = useState<Array<{ q: string; a: ReturnType<typeof answerMoneyQuestion> }>>([]);
  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const d = new Date();
    const a = answerMoneyQuestion(t, plan, spending, now, d.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
    setAnswers((xs) => [{ q: t, a }, ...xs].slice(0, 5));
    setQ("");
  };
  return (
    <Card id="ask-title" title="Ask about your money" description="Answers are worked out on this device from your own plan. Nothing is sent anywhere, invented or changed. Budgeting help, not financial advice." testId="coach-chat">
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.slice(0, 6).map((x) => (
          <Button key={x} size="xs" variant="outline" onClick={() => ask(x)}>
            {x}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor="coach-q" className="sr-only">
          Your question
        </label>
        <input id="coach-q" className={field} value={q} onChange={(e) => setQ(e.target.value.slice(0, 200))} placeholder="e.g. Can I afford a car?" data-testid="coach-input" />
        <Button type="submit" size="icon" aria-label="Ask">
          <SendIcon />
        </Button>
      </form>
      <ul className="space-y-3" aria-live="polite" data-testid="coach-answers">
        {answers.map((x, i) => (
          <li key={i} className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
            <p className="font-medium">{x.q}</p>
            <p className="flex gap-2">
              <SparklesIcon className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
              {x.a.answer}
            </p>
            {x.a.assumptions.length > 0 && (
              <ul className="space-y-0.5 pl-6 text-[11px] text-muted-foreground">
                {x.a.assumptions.map((s) => (
                  <li key={s} className="flex gap-1">
                    <CircleCheckIcon className="mt-px size-3 shrink-0" aria-hidden /> {s}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ======================================================================
// Personal targets (instead of a fixed 50/30/20 rule)
// ======================================================================

export function PersonalTargetsPanel({ plan, now }: { plan: MoneyPlan; now: string }) {
  const formatMoney = useFmt();
  const rows = targetChecks(plan, now);
  return (
    <Card
      id="targets-title"
      title="Your personal targets"
      description="Built from your own costs, goals and emergency fund, not a one-size-fits-all percentage."
      testId="personal-targets"
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const max = Math.max(r.yours, r.target, 1);
          return (
            <li key={r.key} className="space-y-2 rounded-xl border p-3" data-testid={`target-${r.key}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{r.label}</p>
                <p className={`text-xs font-medium ${r.ok ? "text-success-ink" : "text-warning-ink"}`}>{r.ok ? "On target" : "Needs attention"}</p>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0">Your plan</span>
                  <span className="h-2 flex-1 rounded-full bg-secondary" aria-hidden>
                    <span className="block h-2 rounded-full bg-brand" style={{ width: `${(r.yours / max) * 100}%` }} />
                  </span>
                  <span className="tabular w-24 text-right text-foreground">{formatMoney(r.yours)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0">Your target</span>
                  <span className="h-2 flex-1 rounded-full bg-secondary" aria-hidden>
                    <span className="block h-2 rounded-full bg-foreground/40" style={{ width: `${(r.target / max) * 100}%` }} />
                  </span>
                  <span className="tabular w-24 text-right text-foreground">{formatMoney(r.target)}</span>
                </div>
              </div>
              <p className={`flex gap-1.5 text-xs ${r.ok ? "text-success-ink" : "text-warning-ink"}`}>
                {r.ok ? <CircleCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden /> : <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />}
                {r.note}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
