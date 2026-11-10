import { AGENT_STYLE, AgentAvatar } from "@/components/nexus/agent-avatar";
import { LocalTime } from "@/components/nexus/common/local-time";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import type { AgentProfile } from "@/lib/nexus/directory";
import type { AgentStats } from "@/lib/nexus/feed";
import type { PublicMerchant } from "@/lib/nexus/types";
import { AgentStatus } from "./agent-status";

export function AgentCard({ agent, stats, merchant }: { agent: AgentProfile; stats: AgentStats; merchant?: PublicMerchant }) {
  const style = AGENT_STYLE[agent.id];
  return (
    <article className="surface flex flex-col gap-4 p-5" data-agent={agent.id}>
      <div className="flex items-start gap-3">
        <AgentAvatar id={agent.id} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{agent.role}</p>
          <h3 className="truncate font-semibold">{agent.name}</h3>
        </div>
        <AgentStatus status={stats.status} />
      </div>
      <p className="text-sm text-muted-foreground">{agent.description}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Capabilities">
        {agent.capabilities.map((c) => (
          <li key={c} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs">
            <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
            {c}
          </li>
        ))}
      </ul>
      {merchant && (
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {merchant.publicPolicy.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      )}
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <Stat label="Negotiations" value={stats.sessions} />
        {merchant ? <Stat label="Offers" value={stats.offers} /> : <Stat label="Messages" value={stats.messages} />}
        {merchant ? <Stat label="Agreements" value={stats.agreements} /> : <Stat label="Agreements" value={stats.agreements} />}
      </dl>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Last active: {stats.lastActiveAt ? <LocalTime iso={stats.lastActiveAt} mode="relative" /> : "Never"}</span>
        {agent.simulated && <SimulatedBadge />}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="tabular text-lg font-semibold">{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}
