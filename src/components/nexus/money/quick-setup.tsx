"use client";

import { BikeIcon, CarIcon, GraduationCapIcon, HeartIcon, HomeIcon, LaptopIcon, MinusIcon, PlaneIcon, PlusIcon, TargetIcon, UserIcon, UsersIcon, UsersRoundIcon, XIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { lockedMonthly, minLockMonthly, monthLabel, planMonth, type CurrencyCode, type MoneyPlan } from "@/lib/nexus/budget";
import { allocation, answersFrom, CURRENCIES, EMPTY_ANSWERS, emergencyMonthsFor, emergencyRate, FAMILY_DEFAULTS, familyCounts, formatAmount, GOAL_KINDS, incomeSummary, limitOf, LOCK_OPTIONS, personalIncome, quickPlan, type EarningType, type GoalKind, type HouseholdType, type QuickAnswers, type SetupGoal } from "@/lib/nexus/household";
import { buildPots, planPriorities } from "@/lib/nexus/savings-policy";
import { CurrencyInput, CurrencyProvider, useCurrency, useFmt } from "./currency";
import { BuildPots, FamilyNotes, PriorityDonut, SavingsRate } from "./priorities";

const HOUSEHOLDS: Array<{ id: HouseholdType; label: string; hint: string; icon: LucideIcon }> = [
  { id: "single", label: "Just me", hint: "Living on my own", icon: UserIcon },
  { id: "couple", label: "Me and my partner", hint: "No children", icon: UsersIcon },
  { id: "kids", label: "Family with children", hint: "Partner and kids", icon: UsersRoundIcon },
  { id: "joint", label: "Joint family", hint: "Including parents", icon: HomeIcon },
];

const EARNING: Array<{ id: EarningType; label: string }> = [
  { id: "salary", label: "Salary" },
  { id: "business", label: "Own business" },
  { id: "freelance", label: "Freelance or self-employed" },
];

const SCREENS = ["Your household", "Money coming in", "Rent and EMIs", "Your goals"] as const;

/**
 * Four short screens: household, income, rent and EMIs, goals. Everything
 * else (spending limits, emergency fund, savings, daily limits) is worked
 * out and shown live.
 */
export function QuickSetup({ plan, now, onDone, onCancel, startScreen = 0 }: { plan: MoneyPlan; now: string; onDone: (p: MoneyPlan) => void; onCancel?: () => void; startScreen?: number }) {
  const [screen, setScreen] = useState(Math.min(Math.max(0, startScreen), SCREENS.length - 1));
  const [a, setA] = useState<QuickAnswers>(() => (plan.profile || plan.incomes?.length ? answersFrom(plan) : { ...EMPTY_ANSWERS, currency: plan.currency ?? "INR", yourIncomeCents: plan.salaryCents }));
  const set = (patch: Partial<QuickAnswers>) => setA((x) => ({ ...x, ...patch }));
  const fam = familyCounts(a);
  const preview = quickPlan(a, plan, now);
  const ready = personalIncome(a) > 0;
  const formatIncome = (c: number) => formatAmount(c, a.currency);
  const last = screen === SCREENS.length - 1;
  const otherCosts = a.foodCents + a.billsCents + a.medicalCents + a.schoolCents + a.parentsCents;

  return (
    <CurrencyProvider value={a.currency}>
      <section className="surface space-y-5 p-5" aria-labelledby="setup-title" data-testid="onboarding">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="setup-title" className="text-[15px] font-semibold">
              {SCREENS[screen]}
            </h2>
            <p className="text-xs text-muted-foreground">
              {screen + 1} of {SCREENS.length}
            </p>
          </div>
          <div className="flex gap-1" aria-hidden>
            {SCREENS.map((s, i) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= screen ? "bg-brand" : "bg-secondary"}`} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {screen === 0 && (
              <>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who do you look after?">
                  {HOUSEHOLDS.map(({ id, label, hint, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={a.household === id}
                      onClick={() => set({ household: id, ...FAMILY_DEFAULTS[id] })}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${a.household === id ? "border-brand bg-brand-soft/60" : "hover:border-brand/40"}`}
                      data-testid={`household-${id}`}
                    >
                      <Icon className="size-5 text-brand-ink" aria-hidden />
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
                {a.household !== "single" && (
                  <div className="space-y-2 rounded-xl border bg-background/60 p-3" data-testid="family-count">
                    <p className="text-sm font-medium">How many people live on this income?</p>
                    <div className="flex flex-wrap gap-4">
                      <Counter label="Adults" hint={a.household === "joint" ? "You, partner, parents" : "You and your partner"} value={fam.adults} min={a.household === "joint" ? 3 : 2} max={12} onChange={(n) => set({ adults: n })} />
                      {(a.household === "kids" || a.household === "joint") && (
                        <Counter label="Children" hint="Under 18 or studying" value={fam.children} min={a.household === "kids" ? 1 : 0} max={10} onChange={(n) => set({ children: n })} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Family of {fam.size}. This sets your emergency fund ({emergencyMonthsFor(fam.size, fam.children)} months of essentials, {Math.round(emergencyRate(fam.size) * 100)}% of income a month)
                      {fam.children > 0 ? " and savings for each child’s education" : ""}.
                    </p>
                  </div>
                )}
                <label className="block max-w-xs space-y-1 text-sm">
                  <span className="font-medium">Currency</span>
                  <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={a.currency} onChange={(e) => set({ currency: e.target.value as CurrencyCode })}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {screen === 1 && (
              <>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">How do you earn?</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="How do you earn?">
                    {EARNING.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        aria-pressed={a.earning === e.id}
                        onClick={() => set({ earning: e.id })}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${a.earning === e.id ? "border-brand bg-brand-soft/60 font-medium" : "hover:border-brand/40"}`}
                        data-testid={`earning-${e.id}`}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
                {a.earning === "salary" ? (
                  <Money label="Your monthly take-home pay" hint="What reaches your account after tax." cents={a.yourIncomeCents} onChange={(c) => set({ yourIncomeCents: c })} />
                ) : (
                  <>
                    <Money
                      label={a.earning === "business" ? "Money your business brings in each month" : "Freelance income in a normal month"}
                      hint="If it changes month to month, use a careful average. We treat it as an estimate."
                      cents={a.yourIncomeCents}
                      onChange={(c) => set({ yourIncomeCents: c })}
                    />
                    <Money
                      label={a.earning === "business" ? "Business costs and tax set aside" : "Work costs and tax set aside"}
                      hint={`Only what’s left counts as your income: ${formatIncome(personalIncome(a))} a month.`}
                      cents={a.businessCostsCents}
                      onChange={(c) => set({ businessCostsCents: c })}
                    />
                  </>
                )}
                {a.household !== "single" && (
                  <Money label="What your partner adds each month" hint="Optional. Only what goes into household costs." cents={a.partnerIncomeCents} onChange={(c) => set({ partnerIncomeCents: c })} />
                )}
              </>
            )}

            {screen === 2 && (
              <>
                <p className="text-xs text-muted-foreground">Your fixed payments each month. Leave a box at 0 if you don’t pay it.</p>
                <Money label="Rent" hint="Monthly rent. Leave 0 if you own your home." cents={a.rentCents} onChange={(c) => set({ rentCents: c })} />
                <Money label="EMIs" hint="All loan EMIs together: home, car, bike, personal loans and card dues." cents={a.loansCents} onChange={(c) => set({ loansCents: c })} />
                <details className="group rounded-xl border bg-background/60 p-3" open={otherCosts > 0 || undefined} data-testid="other-costs">
                  <summary className="cursor-pointer list-none text-sm font-medium">
                    <span className="text-brand-ink">+ Other monthly costs</span> <span className="font-normal text-muted-foreground">(optional: food, bills, medical{a.household === "kids" || a.household === "joint" ? ", school" : ""})</span>
                  </summary>
                  <p className="mt-2 text-[11px] text-muted-foreground">Adding these makes your spending limits more accurate. We never guess them.</p>
                  <div className="mt-3 space-y-3">
                    <Money label="Food and groceries" cents={a.foodCents} onChange={(c) => set({ foodCents: c })} />
                    <Money label="Bills, transport and phone" cents={a.billsCents} onChange={(c) => set({ billsCents: c })} />
                    <Money label="Medical and medicines" hint="Regular costs, including insurance." cents={a.medicalCents} onChange={(c) => set({ medicalCents: c })} />
                    {(a.household === "kids" || a.household === "joint") && <Money label="School and childcare" cents={a.schoolCents} onChange={(c) => set({ schoolCents: c })} />}
                    {a.household === "joint" && <Money label="Support for parents" cents={a.parentsCents} onChange={(c) => set({ parentsCents: c })} />}
                  </div>
                </details>
              </>
            )}

            {screen === 3 && <GoalsStep plan={plan} goals={a.goals} onChange={(goals) => set({ goals })} />}
          </div>

          <Preview
            plan={preview}
            now={now}
            ready={ready}
            costsKnown={screen >= 2 || a.rentCents + a.loansCents + otherCosts > 0}
            household={HOUSEHOLDS.find((h) => h.id === a.household)!.label}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {screen > 0 && (
            <Button variant="outline" onClick={() => setScreen(screen - 1)}>
              Back
            </Button>
          )}
          {!last ? (
            <Button onClick={() => setScreen(screen + 1)} disabled={screen === 1 && !ready} data-testid="onboarding-next">
              Next
            </Button>
          ) : (
            <Button onClick={() => onDone(preview)} disabled={!ready} data-testid="onboarding-finish">
              Create my plan
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} className="ml-auto">
              Cancel
            </Button>
          )}
        </div>
      </section>
    </CurrencyProvider>
  );
}

const GOAL_ICON: Record<GoalKind, LucideIcon> = {
  house: HomeIcon,
  car: CarIcon,
  bike: BikeIcon,
  education: GraduationCapIcon,
  wedding: HeartIcon,
  travel: PlaneIcon,
  gadget: LaptopIcon,
  other: TargetIcon,
};
const lockLabel = (m: number) => (m < 12 ? `${m} months` : `${m / 12} year${m === 12 ? "" : "s"}`);

/** Pick what you're saving for: a house, a car… Each becomes a lock-in savings plan. */
function GoalsStep({ plan, goals, onChange }: { plan: MoneyPlan; goals: SetupGoal[]; onChange: (g: SetupGoal[]) => void }) {
  const formatMoney = useFmt();
  const currency = useCurrency();
  const min = minLockMonthly(currency);
  const update = (i: number, patch: Partial<SetupGoal>) => onChange(goals.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">What are you saving for? Tap one or more. You can skip this and add goals later.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Goals">
        {GOAL_KINDS.map((k) => {
          const Icon = GOAL_ICON[k.kind];
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => onChange([...goals, { kind: k.kind, name: k.name, targetCents: 0, savedCents: 0, lockMonths: k.lockMonths }])}
              className="flex flex-col items-start gap-1 rounded-xl border bg-background/60 p-2.5 text-left text-sm transition hover:border-gold/60 hover:bg-gold-soft/40"
              data-testid={`goal-pick-${k.kind}`}
            >
              <Icon className="size-4 text-gold-ink" aria-hidden />
              <span className="font-medium">{k.label}</span>
            </button>
          );
        })}
      </div>

      {goals.length > 0 && (
        <ul className="space-y-3" data-testid="setup-goals">
          {goals.map((g, i) => {
            const Icon = GOAL_ICON[g.kind];
            return (
              <li key={i} className="space-y-2 rounded-xl border bg-background/70 p-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-gold-ink" aria-hidden />
                  <input
                    aria-label="Goal name"
                    value={g.name}
                    onChange={(e) => update(i, { name: e.target.value.slice(0, 60) })}
                    className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm font-medium"
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${g.name}`} onClick={() => onChange(goals.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1 text-xs">
                    <p className="font-medium">How much do you need?</p>
                    <CurrencyInput label={`${g.name} amount`} cents={g.targetCents} onChange={(c) => update(i, { targetCents: c })} className="h-9" />
                  </div>
                  <label className="space-y-1 text-xs">
                    <span className="block font-medium">By when?</span>
                    <select
                      className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                      value={g.lockMonths}
                      onChange={(e) => update(i, { lockMonths: Number(e.target.value) })}
                      aria-label={`${g.name} time`}
                    >
                      {LOCK_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          In {lockLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {g.targetCents > 0 && (
                  <p className="text-[11px] text-muted-foreground" data-testid="setup-goal-monthly">
                    Lock {formatMoney(lockedMonthly({ lockMonths: g.lockMonths }, Math.ceil(g.targetCents / g.lockMonths / 100) * 100, g.targetCents, currency))} a month
                    {Math.ceil(g.targetCents / g.lockMonths / 100) * 100 < min ? ` (the ${formatMoney(min)} minimum, so you’ll reach it sooner)` : ""}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {plan.goals.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Already in your plan: {plan.goals.map((g) => `${g.name} (${formatMoney(g.targetCents)})`).join(", ")}.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground" data-testid="lock-rules">
        Each goal becomes a locked savings plan: at least <b className="text-foreground">{formatMoney(minLockMonthly(currency))} a month</b>, kept until the date you pick. No interest is added: it’s your own money, set aside. The plan is tracked in this app; no bank holds it yet.
      </p>
    </div>
  );
}

function Counter({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">
        {label} <span className="font-normal text-muted-foreground">· {hint}</span>
      </p>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          <MinusIcon />
        </Button>
        <span className="tabular w-8 text-center text-base font-semibold" aria-live="polite" data-testid={`count-${label.toLowerCase()}`}>
          {value}
        </span>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}

function Money({ label, hint, cents, onChange }: { label: string; hint?: string; cents: number; onChange: (c: number) => void }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{label}</p>
      <CurrencyInput label={label} cents={cents} onChange={onChange} className="h-11 max-w-72 text-base" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Preview({ plan, now, ready, costsKnown, household }: { plan: MoneyPlan; now: string; ready: boolean; costsKnown: boolean; household: string }) {
  const formatMoney = useFmt();
  const month = planMonth(plan, now);
  const a = allocation(plan, month);
  const pri = planPriorities(plan, month);
  const days = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)), 0).getDate();
  const perDay = (c: number) => Math.floor(c / days / 100) * 100;
  const essentials = plan.bills.filter((b) => (b.kind ?? "need") === "need" && b.amountCents > 0);
  const lifestyle = plan.bills.filter((b) => b.kind === "want" && limitOf(b) > 0).sort((x, y) => limitOf(y) - limitOf(x));
  return (
    <aside className="space-y-4 rounded-xl bg-secondary/60 p-4" aria-label="Your personalised plan" data-testid="setup-preview">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Your personalised plan
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">Made for you</span>
        </p>
        {ready && (
          <p className="text-xs text-muted-foreground">
            Worked out from your {formatMoney(incomeSummary(plan).totalMonthly)} a month, your household ({household.toLowerCase()}) and your real costs. Not a fixed percentage.
          </p>
        )}
      </div>
      {!ready ? (
        <p className="text-sm text-muted-foreground">Add your pay to see how much you can spend on each category.</p>
      ) : !costsKnown ? (
        <p className="text-sm text-muted-foreground" data-testid="preview-waiting">
          Next, add your big monthly costs. Your limits are worked out after those, so we never hand out money your rent or bills need.
        </p>
      ) : (
        <>
          <PriorityDonut p={pri} />
          <FamilyNotes plan={plan} enjoy={pri.enjoy} />
          <SavingsRate p={pri} />
          <p className="text-sm font-semibold">You should spend up to this much each month</p>

          {essentials.length > 0 && (
            <Group title="LIVE · your real costs" testId="preview-essentials">
              {essentials.map((b) => (
                <Row key={b.id} name={b.name} amount={formatMoney(b.amountCents)} />
              ))}
            </Group>
          )}

          {lifestyle.length > 0 && (
            <Group title="ENJOY · spend up to" testId="preview-lifestyle">
              {lifestyle.map((b) => (
                <Row key={b.id} name={b.name} amount={`up to ${formatMoney(limitOf(b))}`} hint={`about ${formatMoney(perDay(limitOf(b)))} a day`} />
              ))}
              <li className="pt-1 text-xs text-muted-foreground">
                In all, spend up to <b className="tabular text-foreground">{formatMoney(perDay(a.lifestyle))}</b> a day on yourself ({formatMoney(a.lifestyle)} a month).
              </li>
            </Group>
          )}

          {month.goals.length > 0 && (
            <Group title="Your goals · saving each month" testId="preview-goals">
              {month.goals.map((gp) => (
                <Row
                  key={gp.goal.id}
                  name={gp.goal.name}
                  amount={formatMoney(gp.neededCents)}
                  hint={`${formatMoney(gp.goal.targetCents)} by ${monthLabel(gp.goal.dueMonth)} · ${gp.status === "on-track" || gp.status === "done" ? "fits your plan" : "needs more time or a smaller amount"}`}
                />
              ))}
            </Group>
          )}

          <div className="space-y-1.5" data-testid="preview-build">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">BUILD · save {formatMoney(pri.build)} each month</p>
            <BuildPots pots={buildPots(pri.build, month.emergencyCents, month.goalsCents, plan.profile?.children ?? 0)} />
            <p className="text-[11px] text-muted-foreground">
              Emergency fund: {plan.emergency?.targetMonths ?? 3} months of essentials. Separate virtual pots, planned in this app; no money is moved or deposited.
            </p>
          </div>

          {pri.status !== "shortfall" && a.explanations.map((x) => (
            <p key={x} className="text-xs text-error-ink" role="status">
              {x}
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">You can change any limit after you create the plan.</p>
        </>
      )}
    </aside>
  );
}

function Group({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1 text-sm">{children}</ul>
    </div>
  );
}

function Row({ name, amount, hint }: { name: string; amount: string; hint?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
      <span className="min-w-0">
        {name}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <b className="tabular shrink-0">{amount}</b>
    </li>
  );
}
