"use client";

import { ArrowUpIcon, Loader2Icon, MicIcon } from "lucide-react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { Button } from "@/components/ui/button";
import type { CommerceSession } from "@/lib/nexus/types";
import { ChatMessage } from "./chat-message";

/** The buyer-agent conversation, shared with voice. */
export function ChatWindow({
  session,
  sending,
  streaming,
  onSend,
  quickReplies = [],
  className,
}: {
  session: CommerceSession;
  sending: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  quickReplies?: string[];
  className?: string;
}) {
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the chat pane, never the page.
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [session.chat.length, sending]);

  const submit = () => {
    const v = text.trim();
    if (!v || sending) return;
    setText("");
    onSend(v);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={log} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" data-testid="chat-log" role="log" aria-live="polite" aria-label="Conversation with your buyer agent" tabIndex={0}>
        <AnimatePresence initial={false}>
          {session.chat.map((m) => (
            <ChatMessage key={m.id} m={m} />
          ))}
        </AnimatePresence>
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AgentAvatar id="buyer" size="sm" />
            Buyer agent is thinking…
          </div>
        )}
      </div>
      <div className="space-y-2 border-t p-3">
        {quickReplies.length > 0 && !sending && !streaming && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {quickReplies.map((q) => (
              <button key={q} type="button" onClick={() => onSend(q)} className="h-7 shrink-0 rounded-full border bg-card px-3 text-xs text-muted-foreground hover:border-foreground/20 hover:text-foreground">
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2 rounded-xl border bg-card p-1.5 focus-within:border-brand/50 focus-within:ring-3 focus-within:ring-brand/15"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label="Message the buyer agent"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={session.result ? "Refine, ask why, or say “go with Vantage”…" : "Tell your buyer agent what you want…"}
            className="field-sizing-content max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button asChild variant="ghost" size="icon" aria-label="Continue by voice">
            <Link href={`/voice?session=${session.id}`}>
              <MicIcon />
            </Link>
          </Button>
          <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Send">
            {sending ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
          </Button>
        </form>
      </div>
    </div>
  );
}
