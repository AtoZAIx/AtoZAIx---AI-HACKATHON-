import Link from "next/link";
import { cn } from "cn";

/** URL-driven filter tabs (server-rendered, work without JavaScript). */
export function FilterTabs({ base, param = "status", options, active }: { base: string; param?: string; options: Array<{ id: string; label: string; count?: number }>; active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" aria-label="Filter">
      {options.map((o) => (
        <Link
          key={o.id}
          href={o.id === "all" ? base : `${base}?${param}=${o.id}`}
          aria-current={active === o.id ? "page" : undefined}
          className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition", active === o.id && "bg-graphite text-white")}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("tabular text-[11px]", active === o.id ? "text-white/70" : "text-muted-foreground/80")}>{o.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
