"use client";

import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { monthKey, monthSpending, planMonth, type MoneyPlan, type Purchase } from "@/lib/nexus/budget";
import { localDay } from "@/lib/nexus/household";
import { runAutomations } from "@/lib/nexus/mandate";
import { AutoPayments } from "./auto-payments";
import { CurrencyProvider } from "./currency";
import { GoalsPanel } from "./goals-panel";
import { CoachChat, EmergencyCard, GoalPriorities, LifeChanges } from "./household-panels";
import { MoneyHealth } from "./money-health";
import { QuickSetup } from "./quick-setup";
import { BuildSummary, GoalsThisMonth, Limits, Overview } from "./simple-view";
import { useMoneyPlan } from "./use-money-plan";

export interface GoalProduct {
  id: string;
  name: string;
  /** Lowest current store price, delivered. */
  fromCents: number;
}

export type UpdatePlan = (fn: (p: MoneyPlan) => MoneyPlan) => void;


export function MoneyPlanner({ purchases, products }: { purchases: Purchase[]; products: GoalProduct[] }) {
  const { plan, update, clear } = useMoneyPlan();
  // null = showing the plan; a number = the setup screen to open.
  const [onboarding, setOnboarding] = useState<number | null>(null);
  // Auto-pay: record rent and other auto-pay bills once a month, on their day.
  useEffect(() => {
    if (!plan) return;
    const today = localDay();
    // Bills and auto-save first, then any pre-approved auto-debits (simulated). Each runs at most once a month.
    if (runAutomations(plan, today) !== plan) update((p) => runAutomations(p, today));
  }, [plan, update]);
  if (!plan) return <LoadingState variant="cards" rows={4} />;
  const now = monthKey(new Date());
  const month = planMonth(plan, now);
  const spending = monthSpending(plan, month, purchases, now);
  const hasPay = plan.salaryCents > 0;
  const personalised = Boolean(plan.profile || plan.incomes?.length || plan.emergency);
  // Rent, EMIs or other must-pay costs entered? Without them, scores and targets would mislead.
  const hasEssentials = plan.bills.some((b) => (b.kind ?? "need") === "need" && b.amountCents > 0);

  // Personalised only: a plan starts with the setup (pay already entered is carried over).
  if (onboarding !== null || !personalised) {
    return (
      <QuickSetup
        plan={plan}
        now={now}
        startScreen={onboarding ?? 0}
        onCancel={personalised ? () => setOnboarding(null) : undefined}
        onDone={(next) => {
          update(() => next);
          setOnboarding(null);
        }}
      />
    );
  }

  return (
    <CurrencyProvider value={plan.currency ?? "USD"}>
      <div className="space-y-6" data-testid="money-planner">
        {hasPay && !hasEssentials && <FinishPlan onAdd={() => setOnboarding(2)} />}
        {hasPay && <Overview plan={plan} month={month} spending={spending} now={now} onEdit={() => setOnboarding(0)} />}
        {hasPay && <Limits plan={plan} spending={spending} update={update} now={now} />}
        {hasPay && <AutoPayments plan={plan} month={month} update={update} today={localDay()} />}
        <GoalsPanel plan={plan} month={month} update={update} products={products} goalPurchases={spending.goalPurchases} now={now} hasPay={hasPay} summary={hasPay && <GoalsThisMonth month={month} now={now} plan={plan} />}>
          {hasPay && <BuildSummary plan={plan} month={month} now={now} />}
        </GoalsPanel>
        {hasPay && <GoalPriorities plan={plan} month={month} update={update} />}

        <details className="group" data-testid="more-tools">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-3 text-sm">
            <span>
              <span className="font-medium">More</span>
              <span className="text-muted-foreground"> · ask a question, emergency fund, life changes, health score</span>
            </span>
            <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <div className="mt-6 space-y-6">
            {hasPay && <CoachChat plan={plan} spending={spending} now={now} />}
            {hasPay && <EmergencyCard plan={plan} update={update} now={now} />}
            {hasPay && <LifeChanges plan={plan} update={update} now={now} />}
            {hasPay && (hasEssentials ? <MoneyHealth plan={plan} month={month} spending={spending} update={update} /> : <NeedsCosts what="your health score" />)}
          </div>
        </details>
        <PlanFooter onClear={clear} />
      </div>
    </CurrencyProvider>
  );
}

/** Shown until rent, EMIs or other must-pay costs are added: the plan isn't finished without them. */
function FinishPlan({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="surface flex flex-col gap-3 border-gold/50 p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="finish-plan">
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold">Finish your plan: add your rent and EMIs</h2>
        <p className="text-sm text-muted-foreground">Your must-pay costs come first. Until they’re added, your spending limits and savings may look bigger than they really are.</p>
      </div>
      <Button onClick={onAdd} data-testid="add-costs">
        Add rent and EMIs
      </Button>
    </section>
  );
}

function NeedsCosts({ what }: { what: string }) {
  return <p className="surface p-5 text-sm text-muted-foreground">Add your rent and EMIs to see {what}.</p>;
}

export function Notice({ tone, children }: { tone: "error" | "warning" | "success"; children: React.ReactNode }) {
  const Icon = tone === "success" ? CircleCheckIcon : tone === "error" ? CircleAlertIcon : TriangleAlertIcon;
  const cls = tone === "success" ? "bg-success-soft text-success-ink" : tone === "error" ? "bg-error-soft text-error-ink" : "bg-warning-soft text-warning-ink";
  return (
    <p className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm ${cls}`} role={tone === "success" ? undefined : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function PlanFooter({ onClear }: { onClear: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>Your plan is saved only in this browser, on this device. It isn’t sent to stores or to PayPal. This is a planning tool, not financial advice.</p>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Clear my plan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear your money plan?</DialogTitle>
            <DialogDescription>This removes your pay, split, goals and spending from this browser. It can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
