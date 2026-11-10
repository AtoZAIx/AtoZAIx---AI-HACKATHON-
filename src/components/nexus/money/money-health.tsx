"use client";

import { CircleAlertIcon, CircleCheckIcon, InfoIcon, Loader2Icon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type MoneyPlan, type MonthPlan, type MonthSpending } from "@/lib/nexus/budget";
import { analyzeMoney, clockFor, type Insight, type InsightAction, type InsightTone } from "@/lib/nexus/budget-insights";
import { api } from "@/lib/nexus/client";
import type { UpdatePlan } from "./money-planner";
import { setEmergency } from "@/lib/nexus/household";

const TONE: Record<InsightTone, { icon: typeof InfoIcon; cls: string; word: string }> = {
  bad: { icon: CircleAlertIcon, cls: "text-error-ink", word: "Needs action" },
  warn: { icon: TriangleAlertIcon, cls: "text-warning-ink", word: "Worth a look" },
  info: { icon: InfoIcon, cls: "text-brand-ink", word: "Idea" },
  good: { icon: CircleCheckIcon, cls: "text-success-ink", word: "Going well" },
};

const BAND = { strong: "Strong", fair: "Fair", "needs-work": "Needs work" } as const;

interface CoachReply {
  source: "gemini" | "rules";
  headline: string;
  tips: string[];
}

/** Health score, computed insights with one-tap fixes, and an optional AI coach that may only restate these numbers. */
export function MoneyHealth({ plan, month, spending, update }: { plan: MoneyPlan; month: MonthPlan; spending: MonthSpending; update: UpdatePlan }) {
  const health = analyzeMoney(plan, month, spending, clockFor(new Date()));
  const [coach, setCoach] = useState<CoachReply | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (a: InsightAction) => {
    if (a.type === "move-date") update((p) => ({ ...p, goals: p.goals.map((g) => (g.id === a.goalId ? { ...g, dueMonth: a.dueMonth } : g)) }));
    // The emergency fund is its own pot, not a goal: 3 months of essentials saved over a year.
    else update((p) => setEmergency(p, { targetMonths: 3, monthlyCents: Math.ceil(a.targetCents / 12 / 100) * 100 }));
    setCoach(null);
  };

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      setCoach(
        await api<CoachReply>("/api/money/coach", {
          json: {
            score: health.score,
            band: health.band,
            parts: health.parts.map((p) => ({ label: p.label, value: p.value, note: p.note })),
            insights: health.insights.map((i) => ({ tone: i.tone, title: i.title, detail: i.detail })),
            amounts: health.amounts,
          },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coach is unavailable right now");
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="surface space-y-5 p-5" aria-labelledby="health-title" data-testid="money-health">
      <div>
        <h2 id="health-title" className="text-[15px] font-semibold">
          Money health
        </h2>
        <p className="text-xs text-muted-foreground">Worked out from your own numbers: how much you save, your bills, emergency cover, goals and this month’s pace.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <p className="tabular text-5xl font-semibold leading-none" data-testid="health-score">
              {health.score}
            </p>
            <div className="pb-1">
              <p className="text-xs text-muted-foreground">out of 100</p>
              <p className="text-sm font-semibold">{BAND[health.band]}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {health.parts.map((p) => (
              <li key={p.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{p.label}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {Math.round(p.value * p.weight)} / {p.weight}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary" aria-hidden>
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${p.value * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{p.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          {health.insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add bills and goals to get specific suggestions.</p>
          ) : (
            <ul className="space-y-2">
              {health.insights.map((i) => (
                <InsightRow key={i.id} insight={i} onApply={apply} />
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <SparklesIcon className="size-4 text-brand-ink" aria-hidden /> AI coach
              </p>
              <Button size="sm" onClick={ask} disabled={asking} data-testid="ask-coach">
                {asking && <Loader2Icon className="animate-spin" />}
                {coach ? "Ask again" : "Ask the AI coach"}
              </Button>
            </div>
            {coach ? (
              <div className="space-y-2" aria-live="polite" data-testid="coach-reply">
                <p className="text-sm font-medium">{coach.headline}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {coach.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  {coach.source === "gemini"
                    ? "Written by Gemini from your numbers. Every amount was checked against your plan."
                    : "Rule-based coach. Add a Gemini key to get AI-written advice; the numbers are the same either way."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sends your score and the suggestions above (not your saved plan) to write a short, personal summary. Nothing is stored. Budgeting help, not financial advice.
              </p>
            )}
            {error && (
              <p className="text-xs text-error-ink" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function InsightRow({ insight, onApply }: { insight: Insight; onApply: (a: InsightAction) => void }) {
  const t = TONE[insight.tone];
  const Icon = t.icon;
  return (
    <li className="flex gap-3 rounded-xl border p-3" data-testid={`insight-${insight.id}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${t.cls}`} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">
          <span className="sr-only">{t.word}: </span>
          {insight.title}
        </p>
        <p className="text-sm text-muted-foreground">{insight.detail}</p>
        {insight.action && (
          <Button size="xs" variant="outline" onClick={() => onApply(insight.action!)} className="mt-1">
            {insight.action.label}
          </Button>
        )}
      </div>
    </li>
  );
}
