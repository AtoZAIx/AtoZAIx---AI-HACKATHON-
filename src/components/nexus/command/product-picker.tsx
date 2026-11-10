"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ProductTile } from "@/components/nexus/product-tile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_LABEL, PRODUCTS, specLine } from "@/lib/nexus/catalog";
import type { Product } from "@/lib/nexus/types";

export function ProductPicker({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (o: boolean) => void; onSelect: (p: Product) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return PRODUCTS.filter((p) => !t || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(t));
  }, [q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b p-4">
          <DialogTitle>Select a product</DialogTitle>
          <DialogDescription>Your buyer agent will negotiate this exact model with every merchant that stocks it.</DialogDescription>
          <label className="mt-2 flex items-center gap-2 rounded-lg border bg-background px-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="h-9 flex-1 bg-transparent text-sm outline-none" aria-label="Search products" />
          </label>
        </DialogHeader>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary"
              >
                <ProductTile product={p} className="size-11 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{specLine(p)}</span>
                </span>
                <span className="eyebrow">{CATEGORY_LABEL[p.category]}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
