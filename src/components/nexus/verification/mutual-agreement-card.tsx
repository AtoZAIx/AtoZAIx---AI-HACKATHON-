import { ArrowRightIcon, FileSignatureIcon } from "lucide-react";
import Link from "next/link";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { OrderStatusBadge } from "@/components/nexus/common/status-badge";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { getProduct } from "@/lib/nexus/catalog";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { Agreement, NexusOrder } from "@/lib/nexus/types";
import { capitalize, termText } from "@/lib/nexus/vocab";
import { LocalTime } from "@/components/nexus/common/local-time";

/** The terms both agents agreed, as signed by the coordinator. */
export function MutualAgreementCard({ agreement, order }: { agreement: Agreement; order: NexusOrder | null }) {
  const t = agreement.terms;
  const product = getProduct(t.productId);
  const words = termText(product.category, t);
  return (
    <section className="surface space-y-4 p-5" aria-label="Your deal">
      <div className="flex items-center gap-2">
        <FileSignatureIcon className="size-4 text-brand-ink" />
        <p className="text-sm font-semibold">Your deal</p>
        <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">Version {agreement.version}</span>
      </div>
      <div className="flex gap-3">
        <ProductTile product={product} className="size-16 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">{product.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AgentAvatar id={agreement.merchantId} size="sm" /> {MERCHANT_DIRECTORY[agreement.merchantId].name}
          </p>
          <SimulatedBadge className="mt-1" />
        </div>
      </div>
      <p className="tabular text-3xl font-semibold">{formatMoney(agreement.totalCents)}</p>
      <dl className="space-y-1.5 text-sm">
        <Row label="Agreed" value={<LocalTime iso={agreement.agreedAt} mode="datetime" />} />
        <Row label="Price valid until" value={<LocalTime iso={t.expiresAt} mode="datetime" />} />
        {words.warranty && <Row label="Warranty" value={capitalize(words.warranty)} />}
        <Row label={words.v.deliveryNoun.replace(" terms", "")} value={capitalize(words.delivery)} />
        <Row label={words.v.returnsNoun.replace(" policy", "s")} value={capitalize(words.returns)} />
        {order?.booking && <Row label="Pay now with PayPal" value={`${formatMoney(order.booking.dealTotalCents - order.booking.balanceDueCents)} refundable token`} />}
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Technical details</summary>
        <dl className="mt-2 space-y-1.5 rounded-lg bg-secondary p-2">
          <Row label="Terms hash" value={`${agreement.termsHash.slice(0, 20)}…`} mono title={agreement.termsHash} />
          <Row label="Coordinator signature" value={`${agreement.signature.slice(0, 20)}…`} mono title={agreement.signature} />
        </dl>
      </details>
      {order && agreement.verification.ok && (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Order {order.id}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <Button asChild className="w-full">
            <Link href={`/orders/${order.id}`}>
              {order.status === "awaiting_approval" ? "Review & approve" : "View order"} <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono, title }: { label: string; value: React.ReactNode; mono?: boolean; title?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono" : "text-right"} title={title}>
        {value}
      </dd>
    </div>
  );
}
