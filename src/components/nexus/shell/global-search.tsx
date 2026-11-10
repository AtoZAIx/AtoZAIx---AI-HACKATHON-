"use client";

import { MessagesSquareIcon, PackageIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Hit {
  kind: "negotiation" | "order" | "product";
  title: string;
  detail: string;
  href: string;
}

const ICON = { negotiation: MessagesSquareIcon, order: PackageIcon, product: SparklesIcon };

export function GlobalSearch({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function query(value: string) {
    setQ(value);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store" });
        setHits(((await res.json()) as { hits: Hit[] }).hits);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 160);
  }

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(hit.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-xl border bg-card px-3 text-sm text-muted-foreground shadow-card transition hover:border-foreground/15"
        aria-keyshortcuts="Meta+K"
        aria-label={iconOnly ? "Search your deals, orders or products" : undefined}
      >
        <SearchIcon className="size-4" aria-hidden />
        {!iconOnly && (
          <>
            <span className="flex-1 truncate text-left">Search your deals, orders or products</span>
            <kbd className="hidden rounded-md border bg-secondary px-1.5 font-mono text-[10px] sm:inline" aria-hidden>
              ⌘K
            </kbd>
          </>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => query(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
                if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Search your deals, orders or products…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              aria-label="Search"
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls="search-results"
            />
          </div>
          <ul id="search-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
            {!q && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Type a product name, a store, or an order number.</li>}
            {q && !loading && !hits.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{q}”.</li>}
            {hits.map((h, i) => {
              const Icon = ICON[h.kind];
              return (
                <li key={`${h.kind}-${h.href}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-secondary")}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.detail}</span>
                    </span>
                    <span className="eyebrow">{h.kind}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
