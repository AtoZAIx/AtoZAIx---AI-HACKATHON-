import Link from "next/link";
import { ActivityIcon } from "lucide-react";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { AGENTS } from "@/lib/nexus/directory";
import type { ActivityItem } from "@/lib/nexus/feed";
import { LocalTime } from "@/components/nexus/common/local-time";

export function AgentActivity({ items, empty = "No agent activity yet." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <EmptyState compact icon={ActivityIcon} title="Quiet so far" description={empty} />;
  return (
    <ol className="surface divide-y overflow-hidden">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={a.href} className="flex gap-3 px-4 py-3 transition hover:bg-secondary/60">
            <AgentAvatar id={a.agent} size="sm" className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{AGENTS[a.agent].name}</span>
                <time className="tabular text-muted-foreground"><LocalTime iso={a.at} mode="datetime" /></time>
              </span>
              <span className="line-clamp-2 text-[13px] text-muted-foreground">{a.text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
