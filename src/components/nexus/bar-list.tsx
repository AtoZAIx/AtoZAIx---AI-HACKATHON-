"use client";

import { useState } from "react";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  display: string;
  detail: string;
  /** CSS colour for the mark (identity or single series). */
  color: string;
}

/** Horizontal bars: thin marks, 4px rounded data end, value at the tip, per-bar tooltip. */
export function BarList({ data, max, ariaLabel }: { data: BarDatum[]; max?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2" role="list" aria-label={ariaLabel}>
      {data.map((d) => {
        const pct = Math.max(0, Math.min(100, (d.value / top) * 100));
        return (
          <div
            key={d.key}
            role="listitem"
            tabIndex={0}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(d.key)}
            onBlur={() => setHover(null)}
            aria-label={`${d.label}: ${d.display}. ${d.detail}`}
            className="relative col-span-2 grid grid-cols-subgrid items-center rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 text-sm whitespace-nowrap">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
              {d.label}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3.5 rounded-r-[4px] transition-[width] duration-500" style={{ width: `${pct}%`, minWidth: d.value > 0 ? 4 : 0, background: d.color }} aria-hidden />
              <span className="tabular shrink-0 text-xs font-medium">{d.display}</span>
            </span>
            {hover === d.key && (
              <span className="pointer-events-none absolute -top-7 right-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-raised">{d.detail}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
