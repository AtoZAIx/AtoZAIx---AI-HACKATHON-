import { BrainCircuitIcon, FileLock2Icon, KeyRoundIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgentActivity } from "@/components/nexus/agents/agent-activity";
import { AgentCard } from "@/components/nexus/agents/agent-card";
import { AgentNetworkGraph } from "@/components/nexus/agents/agent-network-graph";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import { AGENTS, MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { agentActivity, agentStats } from "@/lib/nexus/feed";
import { geminiEnabled, geminiModel } from "@/lib/nexus/gemini";
import type { AgentId } from "@/lib/nexus/types";

export const metadata: Metadata = { title: "Agent Network" };

const GUARDRAILS = [
  { icon: BrainCircuitIcon, title: "Gemini proposes, policy disposes", body: "Merchant moves are clamped to each merchant's confidential pricing and concession policy." },
  { icon: KeyRoundIcon, title: "Your budget stays private", body: "Merchants only see a target well under your spending limit." },
  { icon: ScaleIcon, title: "Numbers can't drift", body: "Agent messages whose dollar amounts don't match the structured terms are replaced." },
  { icon: FileLock2Icon, title: "Signed, versioned terms", body: "Agreements are hashed and signed; any change creates a new version you must re-approve." },
  { icon: ShieldCheckIcon, title: "Server-side payment truth", body: "Orders confirm only after the capture is re-read from PayPal and the webhook verifies." },
];

const ORDER: AgentId[] = ["buyer", "atelier", "bolt", "cove", "coordinator"];

export default function AgentsPage() {
  return (
    <Page wide>
      <PageHeader
       
        title="Meet the agents"
        description="Your agent works for you. Three store agents each try to win your order in their own way. Nexus keeps the conversation fair."
        actions={
          <Suspense fallback={null}>
            <AiMode />
          </Suspense>
        }
      />
      <Suspense fallback={<LoadingState variant="cards" rows={6} />}>
        <Network />
      </Suspense>
    </Page>
  );
}

async function AiMode() {
  await connection();
  return geminiEnabled() ? <StatusBadge tone="success" label={`Gemini · ${geminiModel()}`} /> : <StatusBadge tone="neutral" label="Policy engine (no Gemini key)" />;
}

async function Network() {
  await connection();
  const [stats, activity] = await Promise.all([agentStats(), agentActivity(10)]);
  return (
    <div className="space-y-6">
      <section className="surface p-4 md:p-6" aria-label="Network diagram">
        <AgentNetworkGraph stats={stats} />
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ORDER.map((id) => (
          <AgentCard key={id} agent={AGENTS[id]} stats={stats[id]} merchant={id === "buyer" || id === "coordinator" ? undefined : MERCHANT_DIRECTORY[id]} />
        ))}
        <section className="surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Guardrails</h2>
          <ul className="space-y-3">
            {GUARDRAILS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Section title="Activity history" description="Latest protocol messages across negotiations">
        <AgentActivity items={activity} empty="Run a negotiation to see agents exchange offers." />
      </Section>
    </div>
  );
}
