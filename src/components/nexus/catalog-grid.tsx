"use client";

import { Loader2Icon, SearchIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { AGENT_STYLE } from "@/components/nexus/agent-avatar";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, PRODUCTS, specLine } from "@/lib/nexus/catalog";
import { api } from "@/lib/nexus/client";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { Category, CommerceSession, MerchantId } from "@/lib/nexus/types";

export interface CatalogListing {
  merchantId: MerchantId;
  productId: string;
  listPriceCents: number;
  shippingCents: number;
  stock: number;
  baseWarrantyMonths: number;
  standardDeliveryDays: number;
}

const FILTERS: Array<{ id: Category | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "laptop", label: "Laptops" },
  { id: "phone", label: "Smartphones" },
  { id: "headphones", label: "Headphones" },
  { id: "monitor", label: "Monitors" },
  { id: "tablet", label: "Tablets" },
];

export function CatalogGrid({ listings, initialQuery = "" }: { listings: CatalogListing[]; initialQuery?: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [brand, setBrand] = useState<string>("all");
  const brands = useMemo(() => [...new Set(PRODUCTS.map((p) => p.brand))], []);
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState<string | null>(null);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter(
      (p) =>
        (filter === "all" || p.category === filter) &&
        (brand === "all" || p.brand === brand) &&
        (!q || `${p.name} ${p.brand} ${p.family} ${p.description} ${p.suitedFor.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [filter, brand, query]);

  async function negotiate(name: string, id: string) {
    setBusy(id);
    try {
      const { session } = await api<{ session: CommerceSession }>("/api/sessions", { json: { text: `Negotiate the best price for the ${name}` } });
      router.push(`/negotiations/${session.id}?go=1`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start negotiation");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" role="tablist" aria-label="Category">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn("h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition", filter === f.id && "bg-graphite text-white")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm sm:w-72">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Search products" />
        </label>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Brand">
        {["all", ...brands].map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={brand === b}
            onClick={() => setBrand(b)}
            className={cn(
              "h-8 shrink-0 rounded-full border bg-card px-3 text-[13px] font-medium text-muted-foreground transition hover:text-foreground",
              brand === b && "border-graphite bg-graphite text-white hover:text-white",
            )}
          >
            {b === "all" ? "All brands" : b}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Real products from well-known brands. Prices and specs are approximate demo values, and the three stores are simulated.</p>

      {products.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No products match" description="Try another search, or describe what you need on the dashboard." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const offers = listings.filter((l) => l.productId === p.id).sort((a, b) => a.listPriceCents - b.listPriceCents);
            return (
              <article key={p.id} className="surface flex flex-col gap-4 p-4" data-product={p.id}>
                <div className="flex gap-4">
                  <ProductTile product={p} className="size-20 shrink-0" />
                  <div className="min-w-0 space-y-1">
                    <p className="eyebrow">
                      {p.brand} · {CATEGORY_LABEL[p.category]}
                    </p>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{specLine(p)}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow">Store prices</p>
                    <SimulatedBadge />
                  </div>
                  <ul className="space-y-1.5">
                    {offers.map((o) => (
                      <li key={o.merchantId} className="flex items-center gap-2 text-sm">
                        <span className={cn("size-2 rounded-full", AGENT_STYLE[o.merchantId].dot)} aria-hidden />
                        <span className="flex-1 truncate">{MERCHANT_DIRECTORY[o.merchantId].name}</span>
                        <span className={cn("text-[11px]", o.stock <= 3 ? "text-warning-ink" : "text-muted-foreground")}>{o.stock} in stock</span>
                        <span className="tabular w-16 text-right font-medium">{formatMoney(o.listPriceCents)}</span>
                      </li>
                    ))}
                    {offers.length === 0 && <li className="text-xs text-muted-foreground">Not stocked by any merchant</li>}
                  </ul>
                </div>
                <Button className="mt-auto w-full" variant="outline" onClick={() => negotiate(p.name, p.id)} disabled={busy !== null || offers.length === 0}>
                  {busy === p.id ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {offers.length > 1 ? `Get the best price from ${offers.length} stores` : "Get the best price"}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
