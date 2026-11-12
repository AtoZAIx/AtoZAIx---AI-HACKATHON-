"use client";

import { Suspense, useEffect, useState } from "react";
import { MobileBottomNav } from "@/components/nexus/shell/mobile-bottom-nav";
import { NexusSidebar } from "@/components/nexus/shell/nexus-sidebar";
import { NexusTopbar } from "@/components/nexus/shell/nexus-topbar";

const KEY = "nexus.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-raised">
        Skip to content
      </a>
      <NexusSidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <NexusTopbar />
        <main id="main" className="min-w-0 flex-1 overflow-x-clip pb-28 md:pb-0">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <MobileBottomNav />
      </Suspense>
    </div>
  );
}
