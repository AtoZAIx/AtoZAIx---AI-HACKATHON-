"use client";

import { HandshakeIcon, HomeIcon, MicIcon, PackageIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { isActive } from "./nav";

const ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/discover", label: "Browse", icon: ShoppingBagIcon },
  { href: "/voice", label: "Speak", icon: MicIcon, primary: true },
  { href: "/negotiations", label: "My deals", icon: HandshakeIcon, match: ["/deals", "/s/", "/verification"] },
  { href: "/orders", label: "Orders", icon: PackageIcon, match: ["/payments"] },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/voice")) return null;
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[27px] border bg-card/95 shadow-raised backdrop-blur-md md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(pathname, { ...item, match: item.match });
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.primary ? "Speak to your agent" : item.label}
                className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground", active && "text-foreground")}
              >
                {item.primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-graphite text-white shadow-float ring-4 ring-background">
                    <Icon className="size-5" />
                  </span>
                ) : (
                  <Icon className={cn("size-5", active && "text-brand-ink")} />
                )}
                <span className={cn(item.primary && "sr-only")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
