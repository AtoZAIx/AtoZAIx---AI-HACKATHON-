"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LocalTime } from "@/components/nexus/common/local-time";

interface Notification {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string;
  tone: "action" | "success" | "info" | "error";
}

const DOT = { action: "bg-warning", success: "bg-success", info: "bg-foreground/50", error: "bg-error" };
const SEEN_KEY = "nexus.notifications.seen";

/** Bell with real notifications derived from orders and negotiations. */
export function Notifications() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [seen, setSeen] = useState<string>(() => {
    try {
      return typeof window === "undefined" ? "" : (localStorage.getItem(SEEN_KEY) ?? "");
    } catch {
      return "";
    }
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      setItems(((await res.json()) as { notifications: Notification[] }).notifications);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        const data = (await res.json()) as { notifications: Notification[] };
        if (alive) setItems(data.notifications);
      } catch {
        if (alive) setItems([]);
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const unread = (items ?? []).filter((n) => n.at > seen).length;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void load();
        if (!open && items?.length) {
          const latest = items[0].at;
          setSeen(latest);
          try {
            localStorage.setItem(SEEN_KEY, latest);
          } catch {}
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
          <BellIcon className="size-[18px]" />
          {unread > 0 && (
            <span className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{unread}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items === null && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</li>}
          {items?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</li>}
          {items?.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="flex gap-3 px-4 py-3 hover:bg-secondary">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[n.tone])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.detail}</span>
                </span>
                <time className="tabular shrink-0 text-[11px] text-muted-foreground"><LocalTime iso={n.at} mode="time" /></time>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
