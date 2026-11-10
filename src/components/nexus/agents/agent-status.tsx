import { StatusBadge } from "@/components/nexus/common/status-badge";

export type AgentRuntimeStatus = "negotiating" | "idle" | "paused";

export function AgentStatus({ status }: { status: AgentRuntimeStatus }) {
  if (status === "negotiating") return <StatusBadge tone="brand" label="Negotiating" pulse />;
  if (status === "paused") return <StatusBadge tone="warning" label="Paused" />;
  return <StatusBadge tone="neutral" label="Idle" />;
}
