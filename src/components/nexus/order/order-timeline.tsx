"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { LocalTime } from "@/components/nexus/common/local-time";
import { friendlyEvent } from "@/lib/nexus/friendly";
import type { NexusOrder } from "@/lib/nexus/types";

/**
 * "What happened", in plain words. Shows the key moments (and the latest
 * step) by default; every step and its technical record are one click away.
 */
export function OrderTimeline({ order, className }: { order: NexusOrder; className?: string }) {
  const [all, setAll] = useState(false);
  const events = order.timeline.map((e, i) => ({ raw: e, f: friendlyEvent(e, order), i }));
  const lastIndex = events.length - 1;
  const shown = all ? events : events.filter((e) => e.f.milestone || e.i === lastIndex);
  const hidden = events.length - shown.length;

  return (
    <div className={cn("space-y-3", className)}>
      <ol className="relative space-y-4 pl-6" aria-label="What happened">
        <span className="absolute top-2 bottom-2 left-[7px] w-px bg-border" aria-hidden />
        {shown.map(({ raw, f, i }) => (
          <li key={`${raw.at}-${i}`} className="relative">
            <span
              className={cn(
                "absolute top-1 -left-6 size-[15px] rounded-full border-[3px] border-card",
                f.tone === "done" && "bg-success",
                f.tone === "info" && "bg-brand",
                f.tone === "error" && "bg-error",
              )}
              aria-hidden
            />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{f.title}</p>
              <LocalTime iso={raw.at} mode="time" className="tabular shrink-0 text-xs text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{f.detail}</p>
            {all && <p className="mt-1 rounded-md bg-secondary px-2 py-1 font-mono text-[11px] break-all text-muted-foreground">{f.technical}</p>}
          </li>
        ))}
      </ol>
      {(hidden > 0 || all) && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {all ? "Show key steps only" : `Show all steps & technical details (${hidden} more)`}
          <ChevronDownIcon className={cn("size-4 transition-transform", all && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
