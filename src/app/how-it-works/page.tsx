import {
  ArrowDownIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  BotIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  EyeOffIcon,
  FingerprintIcon,
  ListChecksIcon,
  ReceiptIcon,
  ScaleIcon,
  ShieldCheckIcon,
  StoreIcon,
  UserIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { commerceAnalytics } from "@/lib/nexus/analytics";
import { AGENTS, MERCHANT_IDS } from "@/lib/nexus/directory";
import { geminiEnabled, geminiModel } from "@/lib/nexus/gemini";
import { formatMoney } from "@/lib/nexus/money";
import { paymentConfig } from "@/lib/nexus/service";

export const metadata: Metadata = {
  title: "How it works",
  description: "AI agents that negotiate for you, check every deal, and pay with PayPal only after you approve the exact terms.",
};

const PROBLEMS = [
  { icon: UserIcon, who: "Shoppers", body: "Comparing stores means many tabs and a lot of time, and most people still pay the list price." },
  { icon: StoreIcon, who: "Stores", body: "Discounts go out as blanket coupons, so margin is given away even to people who would have paid full price." },
  { icon: BotIcon, who: "AI shopping", body: "An agent that can pay is only useful if you can trust it not to overspend, make things up, or leak private data." },
];

const FLOW = [
  { icon: UserIcon, title: "You ask", body: "Type, speak or add a photo. Set a budget if you like; stores never see it." },
  { icon: BotIcon, title: "Agents negotiate", body: "Your buyer agent asks three store agents for offers and pushes back for up to three rounds.", agents: true },
  { icon: ListChecksIcon, title: "18 deal checks", body: "Product, real price, stock, delivery, warranty, returns, budget and untampered terms." },
  { icon: FingerprintIcon, title: "You approve", body: "You approve the exact amount and terms. Any change cancels the approval." },
  { icon: WalletIcon, title: "PayPal pays", body: "PayPal collects the money. 8 payment checks must pass before we say “paid”." },
];

const GUARANTEES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FingerprintIcon,
    title: "Never pays more than you approved",
    body: "Your approval is tied to the exact amount, a fingerprint of the terms and the deal version. If anything changes, you approve again.",
  },
  {
    icon: ScaleIcon,
    title: "Stores keep control of their prices",
    body: "Every offer is held to the store’s floor price, minimum profit and discount budget, and agents only ever use part of a store’s maximum discount. Name a discount and stores meet you halfway.",
  },
  {
    icon: ShieldCheckIcon,
    title: "The AI can’t invent numbers",
    body: "If an AI-written message quotes a price that doesn’t match the real offer, it’s thrown away and replaced with the checked figures.",
  },
  {
    icon: EyeOffIcon,
    title: "Store secrets stay secret",
    body: "Costs, margins and budgets stay on the server and are shown only to that store after it signs in. Shoppers and their agent never see them.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Every deal is checked first",
    body: "18 checks run before you can approve. If an essential fact can’t be confirmed, the deal is blocked, exactly as if it had failed.",
  },
  {
    icon: ReceiptIcon,
    title: "Paid means really paid",
    body: "We confirm an order only after PayPal has collected the money and the amount, currency, payee, reference and terms all match.",
  },
];

const BENEFITS = [
  {
    who: "Shoppers",
    points: ["Better total value: price, warranty, delivery and extras are weighed together", "No tab-hopping: three stores answer in seconds", "Full control: nothing is paid without your approval"],
  },
  {
    who: "Stores",
    points: ["Concede only when it wins a sale, instead of blanket coupons", "Choose a strategy: premium service, lowest price or bundles", "A private workspace to set limits and see why deals were won or lost"],
  },
  {
    who: "PayPal",
    points: ["A trusted checkout for AI agents: every agent deal ends in PayPal", "Verification turns “an AI bought it” into a payment people can trust", "Works with PayPal’s existing Orders API, so no new rails are needed"],
  },
];

const NEXT = ["Onboard real stores through a product feed", "Store data in a database instead of server memory", "Sign in with passkeys", "Deploy publicly so PayPal webhooks can confirm payments", "Connect PayPal’s own AI-agent tools"];

export default function HowItWorksPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="PayPal Nexus in two minutes"
        title="AI agents that negotiate for you, and can’t overspend."
        description="Your buyer agent bargains with stores’ AI agents in real time, every deal is checked, and PayPal pays only after you approve the exact terms."
        actions={
          <>
            <Button asChild>
              <Link href="/">
                Try a live deal <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">Meet the agents</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<Skeleton className="h-36 rounded-2xl" />}>
        <LiveStatus />
      </Suspense>

      <Section title="The problem">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, who, body }) => (
            <li key={who} className="surface space-y-2 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-brand-ink" aria-hidden /> {who}
              </p>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How a deal works" description="One request, start to finish. Every step is in the app today.">
        <ol className="grid grid-cols-1 gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:gap-0">
          {FLOW.map(({ icon: Icon, title, body, agents }, i) => (
            <li key={title} className="flex flex-col items-stretch lg:flex-row">
              <div className="surface flex-1 space-y-2 p-4">
                <span className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{i + 1}</span>
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
                {agents && (
                  <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Store agents">
                    {MERCHANT_IDS.map((id) => (
                      <li key={id} className="flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pr-2.5 pl-0.5 text-[11px] font-medium">
                        <AgentAvatar id={id} size="sm" />
                        {AGENTS[id].role.split("— ")[1]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {i < FLOW.length - 1 && (
                <span className="flex justify-center py-0.5 text-muted-foreground lg:self-center lg:px-1 lg:py-0" aria-hidden>
                  <ArrowDownIcon className="size-4 lg:hidden" />
                  <ArrowRightIcon className="hidden size-4 lg:block" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Six guarantees, enforced in code" description="These are rules the server enforces, not promises in the interface.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="surface space-y-2 p-5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Who benefits">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {BENEFITS.map(({ who, points }) => (
            <li key={who} className="surface space-y-3 p-5">
              <p className="text-sm font-semibold">{who}</p>
              <ul className="space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-muted-foreground">
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What’s next">
        <ul className="surface grid grid-cols-1 gap-x-6 gap-y-2 p-5 sm:grid-cols-2">
          {NEXT.map((n) => (
            <li key={n} className="flex gap-2 text-sm text-muted-foreground">
              <CircleDashedIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

/** What is actually switched on right now, read from the server, plus counts from real activity. */
async function LiveStatus() {
  await connection();
  const payments = paymentConfig();
  const ai = geminiEnabled();
  const a = await commerceAnalytics();
  const rows: { label: string; value: string; on: boolean }[] = [
    { label: "AI negotiation", value: ai ? `Gemini (${geminiModel()}) suggests moves; store rules decide` : "Rule-based agents. Add a Gemini key to switch on AI", on: ai },
    {
      label: "Payments",
      value: payments.provider === "paypal-sandbox" ? "PayPal Sandbox, real Orders v2 API" : "Built-in simulator. Add PayPal keys for Sandbox",
      on: payments.provider === "paypal-sandbox",
    },
    {
      label: "Payment confirmation",
      value: payments.webhookRequired ? "Needs PayPal’s signed webhook" : "Re-read from PayPal after capture (webhook optional)",
      on: true,
    },
    { label: "Data", value: "Held in server memory; resets on restart", on: false },
  ];
  const stats = [
    { label: "Negotiations run", value: String(a.negotiations) },
    { label: "Deals that passed checks", value: String(a.agreements) },
    { label: "Payments verified", value: String(a.verifiedTransactions) },
    { label: "Saved on paid orders", value: formatMoney(a.savingsCents) },
  ];
  return (
    <section aria-labelledby="live-title" className="surface space-y-4 p-5">
      <div>
        <h2 id="live-title" className="text-[15px] font-semibold">
          Running right now
        </h2>
        <p className="text-xs text-muted-foreground">Read live from this server. Numbers are counted from real activity, never estimated.</p>
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl bg-secondary px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {r.on ? <CircleCheckIcon className="size-3.5 shrink-0 text-success" aria-hidden /> : <CircleDashedIcon className="size-3.5 shrink-0" aria-hidden />}
              {r.label}
              <span className="sr-only">{r.on ? "(on)" : "(not yet)"}</span>
            </dt>
            <dd className="pl-5 text-sm font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="tabular text-xl font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
