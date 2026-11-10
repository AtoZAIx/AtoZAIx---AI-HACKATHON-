import { MicIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "cn";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import type { ChatMessage as Msg } from "@/lib/nexus/types";
import { LocalTime } from "@/components/nexus/common/local-time";

export function ChatMessage({ m }: { m: Msg }) {
  const mine = m.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2.5", mine && "justify-end")} data-role={m.role}>
      {!mine && <AgentAvatar id="buyer" size="sm" className="mt-0.5" />}
      <div className={cn("max-w-[86%] space-y-1", mine && "items-end text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed whitespace-pre-line",
            mine ? "rounded-br-md bg-graphite text-white" : "rounded-bl-md border bg-card",
          )}
        >
          {m.text}
        </div>
        <p className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
          {m.via === "voice" && <MicIcon className="size-3" aria-label="Voice" />}
          <time dateTime={m.createdAt}><LocalTime iso={m.createdAt} mode="time" /></time>
        </p>
      </div>
    </motion.div>
  );
}
