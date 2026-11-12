"use client";

import { ChevronDownIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { cn } from "cn";
import { Wordmark } from "@/components/nexus/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAIN_NAV, MORE_NAV, isActive, type NavItem } from "./nav";

/** Reads the URL, so it renders inside <Suspense> (Cache Components). */
export function SidebarNav(props: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<SidebarNavView {...props} pathname={null} />}>
      <SidebarNavLive {...props} />
    </Suspense>
  );
}

function SidebarNavLive(props: { collapsed?: boolean; onNavigate?: () => void }) {
  return <SidebarNavView {...props} pathname={usePathname()} />;
}

function NavLink({ item, pathname, collapsed, onNavigate, big }: { item: NavItem; pathname: string | null; collapsed: boolean; onNavigate?: () => void; big?: boolean }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 text-muted-foreground transition-all duration-300 hover:bg-secondary hover:text-foreground",
        big ? "h-11 text-[15px] font-medium" : "h-9 text-sm",
        active && "bg-gradient-to-r from-gold-soft/80 to-secondary/60 font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-gold to-brand" aria-hidden />}
      <Icon className={cn("shrink-0", big ? "size-5" : "size-[18px]", active ? "text-brand-ink" : "text-muted-foreground group-hover:text-foreground")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label} · {item.hint}
      </TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

function SidebarNavView({ collapsed = false, onNavigate, pathname }: { collapsed?: boolean; onNavigate?: () => void; pathname: string | null }) {
  const moreActive = MORE_NAV.some((i) => isActive(pathname, i));
  const [open, setOpen] = useState(moreActive);
  const showMore = open || moreActive || collapsed;
  return (
    <nav aria-label="Primary" className="flex flex-col gap-4">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          "group/new relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-[#2a2a2a] to-graphite text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_20px_-10px_rgb(20_15_5/0.6)] transition hover:-translate-y-px",
          collapsed && "px-0",
        )}
        aria-label="Start a new request"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[rgb(232_205_150/0.35)] to-transparent transition-transform duration-1000 group-hover/new:translate-x-full" aria-hidden />
        <PlusIcon className="size-4 text-gold" />
        {!collapsed && "New request"}
      </Link>
      <ul className="space-y-1">
        {MAIN_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} big />
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        {collapsed ? (
          <div className="mx-3 h-px bg-border" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={showMore}
            className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            More
            <ChevronDownIcon className={cn("size-4 transition-transform", showMore && "rotate-180")} />
          </button>
        )}
        {showMore && (
          <ul className="space-y-0.5">
            {MORE_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}

export function NexusSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn("sticky top-0 hidden h-dvh shrink-0 py-3 pl-3 transition-[width] duration-300 lg:block", collapsed ? "w-[88px]" : "w-[260px]")} aria-label="Sidebar">
      {/* A floating panel with 27px rounded corners, like the header. */}
      <div className="flex h-full flex-col overflow-hidden rounded-[27px] border bg-sidebar/80 shadow-card backdrop-blur-xl">
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-5")}>
        {/* Expanded, the visible wordmark names the link; collapsed, only the logo shows. */}
        <Link href="/" aria-label={collapsed ? "AtoZAIx home" : undefined}>
          <Wordmark collapsed={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="space-y-1 border-t p-3">
        <Link
          href="/merchant"
          className={cn("flex h-9 items-center gap-3 rounded-xl px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground", collapsed && "justify-center px-0")}
          aria-label="For merchants"
        >
          <StoreIcon className="size-4" />
          {!collapsed && "For merchants"}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className={cn("flex h-9 w-full items-center gap-3 rounded-xl px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground", collapsed && "justify-center px-0")}
          aria-label={collapsed ? "Expand menu" : undefined}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          {!collapsed && "Collapse menu"}
        </button>
      </div>
      </div>
    </aside>
  );
}
