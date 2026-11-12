import { ArrowRightIcon, CreditCardIcon, HandshakeIcon, MessageSquareTextIcon, MousePointerClickIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { NexusCommandInput } from "@/components/nexus/command/nexus-command-input";
import { LocalTime } from "@/components/nexus/common/local-time";
import { Page } from "@/components/nexus/common/page-header";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findProduct } from "@/lib/nexus/catalog";
import { nextAction } from "@/lib/nexus/journey";
import { store } from "@/lib/nexus/store";

const HOW = [
  { icon: MessageSquareTextIcon, title: "Tell us what you need", body: "Type, speak, or add a photo. Add a budget if you have one." },
  { icon: HandshakeIcon, title: "AI agents get prices", body: "Your agent asks 3 stores for their best price, in seconds." },
  { icon: MousePointerClickIcon, title: "Pick a deal", body: "We show our pick first and explain why, in plain words." },
  { icon: CreditCardIcon, title: "Approve & pay", body: "Check the exact price, then pay safely with PayPal." },
];

export default function HomePage() {
  return (
    <Page>
      <section className="relative isolate mx-auto max-w-3xl space-y-6 pt-4 text-center md:pt-12">
        <div className="aurora" aria-hidden />
        <p className="eyebrow justify-center">Private agentic commerce</p>
        <h1 className="text-[42px] leading-[1.02] text-balance md:text-[68px]">
          Your next purchase, <em className="text-gilded">intelligently</em> negotiated.
        </h1>
        <p className="mx-auto max-w-xl text-base text-pretty text-muted-foreground md:text-[17px]">
          Tell us what you want to buy. AI agents compare stores and negotiate a better price for you. You stay in control: nothing is paid until you approve.
        </p>
        <div className="text-left">
          <NexusCommandInput />
        </div>
      </section>

      <section aria-labelledby="how-title" className="space-y-3">
        <h2 id="how-title" className="eyebrow mx-auto flex w-fit">
          How it works
        </h2>
        <ol className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="surface flex gap-3 p-4">
              <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold-soft text-lg text-gold-ink">{i + 1}</span>
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
                </p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-center">
          <Link href="/how-it-works" className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
            See the safety rules behind every deal <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </p>
      </section>

      <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
        <ContinueList />
      </Suspense>
    </Page>
  );
}

async function ContinueList() {
  await connection();
  const [all, orders] = await Promise.all([store.listSessions(20), store.listOrders(50)]);
  const sessions = all.filter((s) => s.intent);
  if (!sessions.length) return null;
  // One orders list for all rows, instead of one database call per deal.
  const byId = new Map(orders.map((o) => [o.id, o]));
  const rows = await Promise.all(
    sessions.slice(0, 5).map(async (s) => {
      const order = s.orderId ? (byId.get(s.orderId) ?? (await store.getOrder(s.orderId))) : null;
      return { s, order, next: nextAction(s, order) };
    }),
  );
  return (
    <section aria-labelledby="continue-title" className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 id="continue-title" className="text-lg font-semibold">
          Continue where you left off
        </h2>
        <Link href="/negotiations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          All my deals <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <ul className="surface divide-y overflow-hidden">
        {rows.map(({ s, order, next }) => {
          const top = s.result?.ranking[0] ? s.offers.find((o) => o.id === s.result!.ranking[0].offerId) : undefined;
          const productId = order?.terms.productId ?? top?.terms?.productId ?? s.intent?.targetProductId ?? null;
          const product = productId ? findProduct(productId) : null;
          return (
            <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {product ? <ProductTile product={product} className="size-12 shrink-0 rounded-xl" /> : <span className="size-12 shrink-0 rounded-xl bg-secondary" aria-hidden />}
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.intent!.summary.split(" · ")[0]}</p>
                  <p className="text-sm text-muted-foreground">
                    {next.status} · <LocalTime iso={s.updatedAt} mode="relative" />
                  </p>
                </div>
              </div>
              <Button asChild variant={next.label === "Approve & pay" || next.label === "Pick a deal" ? "default" : "outline"} className="sm:min-w-36">
                <Link href={next.href}>
                  {next.label} <ArrowRightIcon />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
