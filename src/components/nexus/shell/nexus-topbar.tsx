"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/nexus/logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConnectionStatus } from "./connection-status";
import { GlobalSearch } from "./global-search";
import { SidebarNav } from "./nexus-sidebar";
import { Notifications } from "./notifications";
import { ProfileMenu } from "./profile-menu";

export function NexusTopbar() {
  const [drawer, setDrawer] = useState(false);
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 md:px-4 lg:px-6">
      {/* A floating bar with 27px rounded corners. */}
      <div className="flex h-16 items-center gap-3 rounded-[27px] border bg-background/80 px-3 shadow-card sm:px-4 backdrop-blur-xl backdrop-saturate-150 md:px-5">
        <button type="button" className="flex size-9 items-center justify-center rounded-xl hover:bg-secondary lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
          <MenuIcon className="size-5" />
        </button>
        {/* The visible wordmark ("AtoZAIx PAYPAL") names the link. */}
        <Link href="/" className="lg:hidden">
          <Wordmark compact />
        </Link>
        <div className="hidden min-w-0 flex-1 md:block">
          <GlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <div className="md:hidden">
            <GlobalSearchIconOnly />
          </div>
          <div className="hidden sm:block">
            <ConnectionStatus />
          </div>
          {/* On the smallest phones there's no room; the same status is in Settings. */}
          <div className="max-[379px]:hidden sm:hidden">
            <ConnectionStatus compact />
          </div>
          <Notifications />
          <ProfileMenu />
        </div>
      </div>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="top-3! bottom-3! left-3! h-auto! w-[280px] overflow-hidden rounded-[27px] border p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center px-5">
            <Wordmark />
          </div>
          <div className="overflow-y-auto px-3 pb-6">
            <SidebarNav onNavigate={() => setDrawer(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function GlobalSearchIconOnly() {
  return (
    <div className="w-9 overflow-hidden [&_button]:w-9 [&_button]:justify-center [&_button]:px-0">
      <GlobalSearch iconOnly />
    </div>
  );
}
