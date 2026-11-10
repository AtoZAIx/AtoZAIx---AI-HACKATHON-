"use client";

import { useSyncExternalStore } from "react";

type Mode = "time" | "time-s" | "datetime" | "date" | "relative";

const subscribe = () => () => {};

function format(iso: string, mode: Mode): string {
  const d = new Date(iso);
  switch (mode) {
    case "time":
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "time-s":
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    case "date":
      return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    case "datetime":
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    case "relative": {
      const s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 60) return "just now";
      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }
}

/**
 * Formats a timestamp in the viewer's own locale and timezone. Renders an
 * empty placeholder on the server so hydration never mismatches.
 */
export function LocalTime({ iso, mode = "time", className }: { iso: string; mode?: Mode; className?: string }) {
  const client = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} className={className} title={client ? new Date(iso).toLocaleString() : undefined}>
      {client ? format(iso, mode) : " "}
    </time>
  );
}
