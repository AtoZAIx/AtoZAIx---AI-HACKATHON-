import { GemIcon, GiftIcon, NetworkIcon, ShieldCheckIcon, ZapIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { AgentId } from "@/lib/nexus/types";

export const AGENT_STYLE: Record<AgentId, { icon: LucideIcon; text: string; bg: string; ring: string; border: string; dot: string; color: string }> = {
  buyer: { icon: ShieldCheckIcon, text: "text-agent-buyer", bg: "bg-brand-soft", ring: "ring-agent-buyer/25", border: "border-agent-buyer/40", dot: "bg-agent-buyer", color: "var(--agent-buyer)" },
  coordinator: { icon: NetworkIcon, text: "text-agent-coordinator", bg: "bg-secondary", ring: "ring-agent-coordinator/20", border: "border-agent-coordinator/40", dot: "bg-agent-coordinator", color: "var(--agent-coordinator)" },
  atelier: { icon: GemIcon, text: "text-agent-atelier", bg: "bg-agent-atelier/8", ring: "ring-agent-atelier/25", border: "border-agent-atelier/40", dot: "bg-agent-atelier", color: "var(--agent-atelier)" },
  bolt: { icon: ZapIcon, text: "text-agent-bolt", bg: "bg-agent-bolt/8", ring: "ring-agent-bolt/25", border: "border-agent-bolt/40", dot: "bg-agent-bolt", color: "var(--agent-bolt)" },
  cove: { icon: GiftIcon, text: "text-agent-cove", bg: "bg-agent-cove/8", ring: "ring-agent-cove/25", border: "border-agent-cove/40", dot: "bg-agent-cove", color: "var(--agent-cove)" },
};

export function AgentAvatar({ id, size = "md", className }: { id: AgentId; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = AGENT_STYLE[id];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full ring-1",
        s.bg,
        s.text,
        s.ring,
        size === "sm" && "size-6 [&>svg]:size-3.5",
        size === "md" && "size-8 [&>svg]:size-4",
        size === "lg" && "size-11 [&>svg]:size-5",
        size === "xl" && "size-14 [&>svg]:size-6",
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
