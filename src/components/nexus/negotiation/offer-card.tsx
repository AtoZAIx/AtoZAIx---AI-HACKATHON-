import { PackageIcon, RotateCcwIcon, ShieldIcon, TruckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { getProduct } from "@/lib/nexus/catalog";
import { formatMoney } from "@/lib/nexus/money";
import type { Offer } from "@/lib/nexus/types";
import { termText } from "@/lib/nexus/vocab";

/** Structured offer terms as they changed this round. */
export function OfferCard({ offer, previous, compact }: { offer: Offer; previous?: Offer; compact?: boolean }) {
  if (!offer.terms) return null;
  const t = offer.terms;
  const product = getProduct(t.productId);
  const prev = previous?.terms;
  const words = termText(product.category, t);
  const delta = previous?.totalCents && offer.totalCents ? offer.totalCents - previous.totalCents : 0;
  return (
    <div className={cn("rounded-xl border bg-background/60", compact ? "p-3" : "p-3.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium">
          {product.name}
          {t.quantity > 1 && <span className="text-muted-foreground"> × {t.quantity}</span>}
        </p>
        <div className="flex items-baseline gap-2">
          {delta < 0 && <span className="tabular text-xs font-medium text-success-ink">−{formatMoney(-delta)}</span>}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={offer.totalCents} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="tabular text-base font-semibold">
              {formatMoney(offer.totalCents!)}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {words.warranty && (
          <Term icon={ShieldIcon} changed={Boolean(prev && prev.warrantyMonths !== t.warrantyMonths)}>
            {words.warranty}
          </Term>
        )}
        <Term icon={TruckIcon} changed={Boolean(prev && (prev.deliveryDays !== t.deliveryDays || prev.shippingCents !== t.shippingCents))}>
          {words.delivery} · {words.fees}
        </Term>
        <Term icon={RotateCcwIcon}>{words.returns}</Term>
        {t.bundle.length > 0 && (
          <Term icon={PackageIcon} changed={Boolean(prev && prev.bundle.length !== t.bundle.length)}>
            {t.bundle.map((b) => b.name).join(", ")}
          </Term>
        )}
      </div>
    </div>
  );
}

function Term({ icon: Icon, changed, children }: { icon: typeof ShieldIcon; changed?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5", changed ? "border-brand/40 bg-brand-soft text-brand-ink" : "text-muted-foreground")}>
      <Icon className="size-3" aria-hidden />
      {children}
      {changed && <span className="sr-only">(changed)</span>}
    </span>
  );
}
