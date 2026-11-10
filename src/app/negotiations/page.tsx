import { ArrowRightIcon, HandshakeIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { FilterTabs } from "@/components/nexus/common/filter-tabs";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { LocalTime } from "@/components/nexus/common/local-time";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { ProductTile } from "@/components/nexus/product-tile";
import { Button } from "@/components/ui/button";
import { findProduct } from "@/lib/nexus/catalog";
import { journeyStep, nextAction } from "@/lib/nexus/journey";
import { formatMoney } from "@/lib/nexus/money";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "My deals" };

export default function MyDealsPage({ searchParams }: PageProps<"/negotiations">) {
  return (
    <Page>
      <PageHeader
        title="My deals"
        description="Everything you’ve asked your agent to find. Each one shows what to do next."
        actions={
          <Button asChild>
            <Link href="/">
              <PlusIcon /> New request
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState rows={5} />}>
        <List searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function List({ searchParams }: Pick<PageProps<"/negotiations">, "searchParams">) {
  await connection();
  const q = await searchParams;
  const all = await Promise.all(
    (await store.listSessions(200))
      .filter((s) => s.intent)
      .map(async (s) => {
        const order = s.orderId ? await store.getOrder(s.orderId) : null;
        return { s, order, step: journeyStep(s, order), next: nextAction(s, order) };
      }),
  );
  const filters: Record<string, (r: (typeof all)[number]) => boolean> = {
    all: () => true,
    progress: (r) => r.step === "ask" || r.step === "negotiate",
    pick: (r) => r.step === "choose",
    pay: (r) => r.step === "pay",
    done: (r) => r.step === "done",
  };
  const active = typeof q.status === "string" && q.status in filters ? q.status : "all";
  const rows = all.filter(filters[active]);
  const count = (id: string) => all.filter(filters[id]).length;
  return (
    <div className="space-y-4">
      <FilterTabs
        base="/negotiations"
        active={active}
        options={[
          { id: "all", label: "All", count: count("all") },
          { id: "pick", label: "Ready to pick", count: count("pick") },
          { id: "pay", label: "Ready to pay", count: count("pay") },
          { id: "done", label: "Done", count: count("done") },
          { id: "progress", label: "In progress", count: count("progress") },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={HandshakeIcon}
          title={active === "all" ? "No deals yet" : "Nothing here"}
          description="Tell your agent what you want on the Home page and it will find offers for you."
          action={
            <Button asChild>
              <Link href="/">Start a request</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ s, order, next }) => {
            const best = s.result?.ranking[0];
            const top = best ? s.offers.find((o) => o.id === best.offerId) : undefined;
            const productId = order?.terms.productId ?? top?.terms?.productId ?? s.intent!.targetProductId;
            const product = productId ? findProduct(productId) : null;
            return (
              <li key={s.id} className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {product ? <ProductTile product={product} className="size-14 shrink-0" /> : <span className="size-14 shrink-0 rounded-2xl bg-secondary" aria-hidden />}
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium">{s.intent!.summary.split(" · ")[0]}</p>
                    <p className="text-sm text-muted-foreground">{next.status}</p>
                    <p className="text-xs text-muted-foreground">
                      <LocalTime iso={s.createdAt} mode="datetime" />
                      {best && ` · best offer ${formatMoney(order?.totalCents ?? best.totalCents)}`}
                    </p>
                  </div>
                </div>
                <Button asChild variant={next.label === "View order" ? "outline" : "default"} className="sm:min-w-36">
                  <Link href={next.href}>
                    {next.label} <ArrowRightIcon />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
