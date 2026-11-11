import { EyeOffIcon } from "lucide-react";
import { findProduct } from "@/lib/nexus/catalog";
import { PRIORITY_LABEL, requestHead, USE_LABEL } from "@/lib/nexus/intent";
import { formatMoney } from "@/lib/nexus/money";
import type { CommerceSession } from "@/lib/nexus/types";

/** "What you asked for", in plain words. */
export function RequestSummary({ session }: { session: CommerceSession }) {
  const i = session.intent;
  if (!i) return null;
  const model = i.targetProductId ? findProduct(i.targetProductId)?.name : null;
  const must = [
    i.requiredFamily ? `${i.requiredBrand === "Apple" ? "" : `${i.requiredBrand} `}${i.requiredFamily}` : i.requiredBrand ? `Brand: ${i.requiredBrand}` : null,
    i.minRamGb ? `At least ${i.minRamGb}GB memory` : null,
    i.minBedrooms ? `At least ${i.minBedrooms} bedroom${i.minBedrooms === 1 ? "" : "s"}` : null,
    i.minStorageGb ? `At least ${i.minStorageGb >= 1024 ? `${i.minStorageGb / 1024}TB` : `${i.minStorageGb}GB`} storage` : null,
    i.needsDedicatedGpu ? "Gaming-grade graphics" : null,
    i.maxWeightKg ? `Under ${i.maxWeightKg}kg` : null,
    i.maxDeliveryDays ? `Delivered within ${i.maxDeliveryDays} days` : null,
    i.quantity > 1 ? `${i.quantity} units` : null,
  ].filter(Boolean) as string[];
  const nice = [
    `Best for: ${PRIORITY_LABEL[i.priority]}`,
    i.minWarrantyMonths ? `${i.minWarrantyMonths}+ month warranty` : null,
    i.preferredBrands.length ? `Brand: ${i.preferredBrands.join(", ")}` : null,
  ].filter(Boolean) as string[];
  return (
    <section className="surface space-y-4 p-5" aria-label="What you asked for">
      <div>
        <p className="text-xs font-medium text-muted-foreground">You asked for</p>
        <p className="text-base font-semibold">{model ?? `${requestHead(i)}${i.useCase ? ` for ${USE_LABEL[i.useCase]}` : ""}`}</p>
      </div>
      <div className="flex items-start justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5">
        <div>
          <p className="text-xs text-muted-foreground">Your budget</p>
          <p className="tabular font-semibold">{i.budgetCents ? formatMoney(i.budgetCents) : "No limit set"}</p>
        </div>
        {i.budgetCents && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <EyeOffIcon className="size-3.5" /> Hidden from stores
          </span>
        )}
      </div>
      {i.askDiscountPct ? (
        <div className="rounded-xl bg-brand-soft/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Discount you asked for</p>
          <p className="tabular font-semibold">{Math.round(i.askDiscountPct * 100)}% off</p>
          <p className="text-[11px] text-muted-foreground">Stores meet you halfway between their opening price and your ask, within their own limits.</p>
        </div>
      ) : null}
      {must.length > 0 && <List title="Must have" items={must} />}
      <List title="Nice to have" items={nice} />
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-sm">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/50" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
