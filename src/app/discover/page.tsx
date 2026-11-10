import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatalogGrid } from "@/components/nexus/catalog-grid";
import { NexusCommandInput } from "@/components/nexus/command/nexus-command-input";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader } from "@/components/nexus/common/page-header";
import { toPublicListing } from "@/lib/nexus/inventory";
import { store } from "@/lib/nexus/store";

export const metadata: Metadata = { title: "Browse" };

export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <Page wide>
      <PageHeader
       
        title="Browse"
        description="See what each store sells and its normal price. Press Negotiate on anything and your agent will try to get it cheaper."
      />
      <NexusCommandInput />
      <Suspense fallback={<LoadingState variant="cards" rows={6} />}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Catalog({ searchParams }: Pick<PageProps<"/discover">, "searchParams">) {
  await connection();
  const q = await searchParams;
  const listings = (await store.listListings()).map(toPublicListing);
  return <CatalogGrid listings={listings} initialQuery={typeof q.q === "string" ? q.q : ""} />;
}
