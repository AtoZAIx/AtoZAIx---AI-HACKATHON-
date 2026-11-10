import {
  BotIcon,
  CopyCheckIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileLockIcon,
  FingerprintIcon,
  KeyRoundIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SirenIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { LocalTime } from "@/components/nexus/common/local-time";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";
import { FirewallTester } from "@/components/nexus/security/firewall-tester";
import { formatMoney } from "@/lib/nexus/money";
import { securityIntelligence } from "@/lib/nexus/security/intelligence";

export const metadata: Metadata = {
  title: "Security center",
  description: "Agent trust, fraud intelligence, AI firewall and payment security, with every decision explained.",
};

const LAYERS: { level: string; icon: LucideIcon; title: string; body: string }[] = [
  { level: "Basic", icon: KeyRoundIcon, title: "Every input is validated", body: "Each API request is checked against a strict schema on the server. Malformed or oversized input is rejected." },
  { level: "Basic", icon: FileLockIcon, title: "Secrets stay on the server", body: "Store costs, floors and PayPal credentials never leave the server, and any AI request containing a secret is refused." },
  { level: "Intermediate", icon: BotIcon, title: "AI firewall, decoded", body: "Messages are screened as written and after decoding base64, hex, URL, HTML entities, ROT13, leetspeak, look-alikes and spaced letters." },
  { level: "Intermediate", icon: ScaleIcon, title: "The AI never sets the price", body: "AI moves are clamped by store rules; an AI message with a number that isn’t real is discarded and counts against that agent’s trust." },
  { level: "Intermediate", icon: UserCheckIcon, title: "Agent trust from behaviour only", body: "Each agent’s score comes from what the server saw. Claims like “trusted seller” are ignored and noted. Restricted store agents are paused." },
  { level: "Advanced", icon: FingerprintIcon, title: "Signed, expiring approval", body: "Approval is signed and bound to the exact amount, currency, store and terms, and expires after 30 minutes. Modified or old approvals are rejected." },
  { level: "Advanced", icon: SirenIcon, title: "Fraud intelligence", body: "Rules plus statistics (z-score and robust outlier score) over velocity, device patterns, repeat attempts, amounts and store risk. Every point explained." },
  { level: "Advanced", icon: CopyCheckIcon, title: "No double payments", body: "Idempotency keys on pay, approve and capture, an atomic capture lock, and reuse of an open PayPal order instead of creating a second." },
  { level: "Advanced", icon: CreditCardIcon, title: "Card-testing lockout", body: "Five declined cards in 10 minutes pauses card payments." },
  { level: "Advanced", icon: ShieldCheckIcon, title: "Webhook replay defence", body: "PayPal messages must pass signature verification, be under 10 minutes old, and never repeat a transmission." },
  { level: "Advanced", icon: DatabaseIcon, title: "Tamper-evident audit log", body: "Every decision is written to an append-only, hash-chained log with card data and secrets redacted. Editing any record breaks the chain." },
];

const LEVEL_TONE = { trusted: "text-success-ink", watch: "text-warning-ink", restricted: "text-error-ink" } as const;
const LEVEL_WORD = { trusted: "Trusted", watch: "On watch", restricted: "Restricted" } as const;
const SEV_TONE = { high: "text-error-ink", medium: "text-warning-ink", low: "text-muted-foreground" } as const;

export default function SecurityPage() {
  return (
    <Page wide>
      <PageHeader
        title="Security center"
        description="Agent trust, fraud intelligence and payment security for AI shopping. Every number below is read from the server’s audit log, and every decision says why."
      />
      <Suspense fallback={<LoadingState variant="cards" rows={6} />}>
        <Dashboard />
      </Suspense>
      <Section title="Try the AI firewall" description="Type any message, including encoded ones. This is a test only: nothing is logged or sent to an agent.">
        <div className="surface p-5">
          <FirewallTester />
        </div>
      </Section>
      <Section title="Defence layers, basic to advanced" description="Each layer is enforced on the server. This is a demo build: it has automated tests but no external security audit.">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map(({ level, icon: Icon, title, body }) => (
            <li key={title} className="surface space-y-2 p-4">
              <span className="flex items-center justify-between gap-2">
                <Icon className="size-4 text-brand-ink" aria-hidden />
                <span className="eyebrow">{level}</span>
              </span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  );
}

async function Dashboard() {
  await connection();
  const s = await securityIntelligence();
  const total = Math.max(1, s.distribution.low + s.distribution.medium + s.distribution.high);
  const tiles = [
    { label: "AI attacks blocked", value: s.counts.promptBlocked },
    { label: "Payments sent for confirmation", value: s.counts.confirm },
    { label: "Payments blocked", value: s.counts.blocked },
    { label: "Fake or replayed PayPal messages", value: s.counts.webhooks },
  ];
  return (
    <>
      <div className={`surface flex flex-wrap items-center gap-3 p-4 text-sm ${s.integrity.ok ? "" : "border-error/50"}`} data-testid="ledger-integrity">
        <DatabaseIcon className={`size-4 ${s.integrity.ok ? "text-success-ink" : "text-error-ink"}`} aria-hidden />
        {s.integrity.ok ? (
          <span>
            <b>Audit log intact.</b> {s.integrity.records} hash-chained records verified; none edited or removed.
          </span>
        ) : (
          <span className="text-error-ink">
            <b>Audit log tampered.</b> Record {s.integrity.brokenAt}: {s.integrity.reason}.
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Catalogue scan: {s.catalog.scanned} product descriptions, {s.catalog.flagged.length} with hidden instructions.
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="security-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="surface p-4">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{t.value}</dd>
            <dd className="text-[11px] text-muted-foreground">Last 24 hours</dd>
          </div>
        ))}
      </dl>

      <Section title="Agent trust scores" description="Computed only from behaviour the server observed. Self-reported reputation is never an input.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="agent-trust">
          {s.agents.map((a) => (
            <li key={a.agent} className="surface space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{a.name}</p>
                <p className={`text-xs font-medium ${LEVEL_TONE[a.level]}`}>{LEVEL_WORD[a.level]}</p>
              </div>
              <p className="tabular text-3xl font-semibold">
                {a.score}
                <span className="text-sm font-normal text-muted-foreground"> / 100</span>
              </p>
              <div className="h-1.5 rounded-full bg-secondary" aria-hidden>
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${a.score}%` }} />
              </div>
              {a.events.length ? (
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  {a.events.slice(0, 3).map((e, i) => (
                    <li key={i}>
                      −{e.weight} {e.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground">No issues observed.</p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Fraud risk distribution" description={`${s.decisionsCount} payment checks so far.`}>
          <div className="surface space-y-3 p-5" data-testid="risk-distribution">
            {(
              [
                ["low", "Low: allowed", "bg-success"],
                ["medium", "Medium: shopper confirmed", "bg-warning"],
                ["high", "High: blocked", "bg-error"],
              ] as const
            ).map(([k, label, bar]) => (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular font-medium">
                    {s.distribution[k]} · {Math.round((s.distribution[k] / total) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary" aria-hidden>
                  <div className={`h-2 rounded-full ${bar}`} style={{ width: `${(s.distribution[k] / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Store risk indicators" description="Feed into every payment’s fraud score.">
          <div className="surface overflow-x-auto" role="region" aria-label="Store risk indicators table" tabIndex={0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Store</th>
                  <th className="px-2 font-medium">Trust</th>
                  <th className="px-2 font-medium">Refund/dispute</th>
                  <th className="px-2 font-medium">AI corrections</th>
                  <th className="px-2 font-medium">Price issues</th>
                  <th className="px-4 font-medium">Sign-in fails</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.merchants.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-medium">{m.name}</td>
                    <td className={`tabular px-2 ${LEVEL_TONE[m.level]}`}>{m.trust}</td>
                    <td className="tabular px-2">{m.disputeRate === null ? "—" : `${Math.round(m.disputeRate * 100)}% of ${m.paid}`}</td>
                    <td className="tabular px-2">{m.guardrailRejections}</td>
                    <td className="tabular px-2">{m.priceInconsistencies}</td>
                    <td className="tabular px-4">{m.authFailures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Blocked payments" description="With the reasons that blocked them.">
          {s.blocked.length === 0 ? (
            <EmptyState icon={SirenIcon} title="No blocked payments" description="High-risk payments and their reasons will appear here." />
          ) : (
            <ul className="surface divide-y">
              {s.blocked.map((b) => (
                <li key={`${b.orderId}-${b.at}`} className="space-y-1 px-4 py-3">
                  <p className="flex justify-between gap-2 text-sm font-medium">
                    <Link href={`/orders/${b.orderId}`} className="hover:underline">
                      {formatMoney(b.totalCents)} order
                    </Link>
                    <span className="tabular text-error-ink">{b.score}/100</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{b.signals.map((x) => `${x.label} (+${x.points})`).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Prompt-injection attempts" description="Direct (from shoppers) and indirect (hidden in store content).">
          {s.injections.length === 0 ? (
            <EmptyState icon={BotIcon} title="No attacks yet" description="Blocked and flagged messages will appear here." />
          ) : (
            <ul className="surface divide-y" data-testid="security-events">
              {s.injections.map((e) => (
                <li key={e.id} className="space-y-0.5 px-4 py-3">
                  <p className={`text-sm font-medium ${SEV_TONE[e.severity]}`}>{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.detail}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <LocalTime iso={e.at} mode="relative" />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Security event timeline" description="Every decision, newest first, with its explanation.">
        {s.timeline.length === 0 ? (
          <EmptyState icon={ShieldCheckIcon} title="Nothing yet" description="Decisions appear here as the system makes them." />
        ) : (
          <ol className="surface divide-y" data-testid="security-timeline">
            {s.timeline.map((t, i) => (
              <li key={i} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <p className="text-[11px] text-muted-foreground">
                  <LocalTime iso={t.at} mode="relative" />
                </p>
                <div className="min-w-0 space-y-0.5">
                  <p className={`text-sm font-medium ${SEV_TONE[t.severity]}`}>{t.title}</p>
                  <p className="text-xs break-words text-muted-foreground">{t.explanation}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
