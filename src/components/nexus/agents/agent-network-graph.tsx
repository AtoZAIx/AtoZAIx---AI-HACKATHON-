import type { AgentStats } from "@/lib/nexus/feed";
import type { AgentId } from "@/lib/nexus/types";

const NODES: Array<{ id: AgentId; x: number; y: number; label: string; sub: string }> = [
  { id: "buyer", x: 110, y: 150, label: "Buyer Agent", sub: "Represents you" },
  { id: "coordinator", x: 360, y: 150, label: "Nexus Coordinator", sub: "Runs the protocol" },
  { id: "atelier", x: 620, y: 52, label: "Maison Aurum", sub: "Premium · simulated" },
  { id: "bolt", x: 620, y: 150, label: "Vantage Electronics", sub: "Competitive · simulated" },
  { id: "cove", x: 620, y: 248, label: "Cove Commerce", sub: "Retention · simulated" },
];

const COLOR: Record<AgentId, string> = {
  buyer: "var(--agent-buyer)",
  coordinator: "var(--agent-coordinator)",
  atelier: "var(--agent-atelier)",
  bolt: "var(--agent-bolt)",
  cove: "var(--agent-cove)",
};

/** Restrained network diagram; links light up only when agents are actually negotiating. */
export function AgentNetworkGraph({ stats }: { stats: Record<AgentId, AgentStats> }) {
  const at = (id: AgentId) => NODES.find((n) => n.id === id)!;
  const live = stats.coordinator.status === "negotiating";
  return (
    <svg viewBox="0 0 760 300" className="h-auto w-full" role="img" aria-label="Buyer agent connected through the Nexus Coordinator to three simulated merchant agents">
      <line x1={at("buyer").x} y1={150} x2={at("coordinator").x} y2={150} stroke={live ? "var(--brand)" : "var(--border)"} strokeWidth="2" />
      {(["atelier", "bolt", "cove"] as AgentId[]).map((m) => (
        <line
          key={m}
          x1={360}
          y1={150}
          x2={at(m).x}
          y2={at(m).y}
          stroke={stats[m].status === "paused" ? "var(--border)" : live ? COLOR[m] : "var(--border)"}
          strokeWidth="2"
          strokeDasharray={stats[m].status === "paused" ? "4 6" : undefined}
        />
      ))}
      <text x="235" y="138" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
        intent · counters
      </text>
      <text x="492" y="128" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
        RFQ · offers
      </text>
      {NODES.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r="26" fill="var(--card)" stroke={COLOR[n.id]} strokeWidth="2" />
          <circle cx={n.x} cy={n.y} r="7" fill={COLOR[n.id]} />
          {stats[n.id].status === "negotiating" && <circle cx={n.x + 19} cy={n.y - 19} r="5" fill="var(--brand)" stroke="var(--card)" strokeWidth="2" />}
          <text x={n.x} y={n.y + 44} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--foreground)">
            {n.label}
          </text>
          <text x={n.x} y={n.y + 59} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
            {n.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
