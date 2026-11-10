import "server-only";
import { z } from "zod";
import { agentDiscountCap, incentiveCostByLever, minimumUnitPrice } from "./agents/pricing";
import { getProduct } from "./catalog";
import { MERCHANT_DIRECTORY } from "./directory";
import { liveMerchants, NexusError } from "./service";
import { store } from "./store";
import { INCENTIVE_LEVERS, type BudgetRemaining, type Cents, type IncentiveLever, type LedgerEntry, type MerchantId, type OfferTerms, type PublicMerchant } from "./types";

export interface WorkspaceListing {
  id: string;
  productId: string;
  productName: string;
  costCents: Cents;
  listPriceCents: Cents;
  maxSellingPriceCents: Cents;
  floorPriceCents: Cents;
  stock: number;
  /** The lowest price the engine will actually accept today (all guardrails). */
  effectiveMinCents: Cents;
  marginAtMinPct: number;
  protection: "protected" | "raised" | "blocked";
  note: string;
}

export interface WorkspacePolicy {
  maxDiscountPct: number;
  agentLimitPct: number;
  openingDiscountPct: number;
  minProfitCents: Cents;
  minMarginPct: number;
  concessionBudgetCents: Cents;
  campaignBudgetCents: Cents;
  incentiveAllocation: Record<IncentiveLever, number>;
  active: boolean;
  offerValidityMinutes: number;
}

export interface HistoryRow {
  sessionId: string;
  at: string;
  productName: string;
  rounds: number;
  openingCents: Cents;
  finalCents: Cents | null;
  outcome: "won" | "recommended" | "lost" | "declined";
  /** Gross profit of the final offer (merchant-only). */
  marginCents: Cents | null;
}

export interface MerchantWorkspace {
  merchant: PublicMerchant;
  policy: WorkspacePolicy;
  remaining: BudgetRemaining;
  listings: WorkspaceListing[];
  ledger: LedgerEntry[];
  history: HistoryRow[];
  /** Items with their own discount limits (e.g. clearance stock). */
  clearance: { listingId: string; productName: string; maxDiscountPct: number; openingDiscountPct: number }[];
}

function baseTerms(listingId: string, merchantId: MerchantId, productId: string, list: Cents, shipping: Cents, warranty: number, days: number): OfferTerms {
  return {
    listingId,
    merchantId,
    productId,
    quantity: 1,
    currency: "USD",
    listPriceCents: list,
    unitPriceCents: list,
    shippingCents: shipping,
    listShippingCents: shipping,
    warrantyMonths: warranty,
    deliveryDays: days,
    express: false,
    returnDays: MERCHANT_DIRECTORY[merchantId].returnDays,
    bundle: [],
    expiresAt: new Date().toISOString(),
  };
}

export async function getWorkspace(merchantId: MerchantId): Promise<MerchantWorkspace> {
  const merchant = (await liveMerchants())[merchantId];
  const p = merchant.policy;
  const listings = (await store.listListings()).filter((l) => l.merchantId === merchantId);
  const rows: WorkspaceListing[] = listings.map((l) => {
    const min = minimumUnitPrice(merchant, l, baseTerms(l.id, merchantId, l.productId, l.listPriceCents, l.shippingCents, l.baseWarrantyMonths, l.standardDeliveryDays));
    const protection = min > l.listPriceCents ? "blocked" : min > l.floorPriceCents ? "raised" : "protected";
    return {
      id: l.id,
      productId: l.productId,
      productName: getProduct(l.productId).name,
      costCents: l.costCents,
      listPriceCents: l.listPriceCents,
      maxSellingPriceCents: l.maxSellingPriceCents,
      floorPriceCents: l.floorPriceCents,
      stock: l.stock,
      effectiveMinCents: min,
      marginAtMinPct: min > 0 ? (min - l.costCents) / min : 0,
      protection,
      note:
        protection === "blocked"
          ? "Guardrails exceed the asking price; withheld from negotiations"
          : protection === "raised"
            ? "Profit, margin or budget guardrail sits above the minimum selling price"
            : "Minimum selling price is the binding floor",
    };
  });

  const sessions = await store.listSessions(200);
  const history: HistoryRow[] = [];
  for (const s of sessions) {
    const mine = s.offers.filter((o) => o.merchantId === merchantId);
    if (!mine.length) continue;
    const last = mine[mine.length - 1];
    const first = mine[0];
    if (!last.terms || !first.terms) {
      history.push({ sessionId: s.id, at: last.createdAt, productName: "—", rounds: 0, openingCents: 0, finalCents: null, outcome: "declined", marginCents: null });
      continue;
    }
    const listing = listings.find((l) => l.id === last.terms!.listingId);
    const incentives = listing ? Object.values(incentiveCostByLever(merchant, listing, last.terms)).reduce((a, b) => a + b, 0) : 0;
    const won = s.agreement?.verification.ok && s.agreement.merchantId === merchantId;
    history.push({
      sessionId: s.id,
      at: last.createdAt,
      productName: getProduct(last.terms.productId).name,
      rounds: last.round,
      openingCents: first.totalCents!,
      finalCents: last.totalCents,
      outcome: won ? "won" : s.result?.ranking[0]?.merchantId === merchantId ? "recommended" : "lost",
      marginCents: listing ? (last.terms.unitPriceCents - listing.costCents) * last.terms.quantity - incentives : null,
    });
  }

  return {
    merchant: MERCHANT_DIRECTORY[merchantId],
    policy: {
      maxDiscountPct: p.maxDiscountPct,
      agentLimitPct: p.agentLimitPct,
      openingDiscountPct: p.openingDiscountPct,
      minProfitCents: p.minProfitCents,
      minMarginPct: p.minMarginPct,
      concessionBudgetCents: p.concessionBudgetCents,
      campaignBudgetCents: p.campaignBudgetCents,
      incentiveAllocation: p.incentiveAllocation,
      active: p.active,
      offerValidityMinutes: p.offerValidityMinutes,
    },
    remaining: p.remaining!,
    listings: rows,
    clearance: listings
      .filter((l) => l.maxDiscountPct != null)
      .map((l) => ({
        listingId: l.id,
        productName: getProduct(l.productId).name,
        maxDiscountPct: l.maxDiscountPct!,
        openingDiscountPct: l.openingDiscountPct ?? p.openingDiscountPct,
      })),
    ledger: (await store.ledger(merchantId)).sort((a, b) => b.at.localeCompare(a.at)),
    history: history.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

const cents = z.number().int().min(0).max(100_000_000);

export const ConfigBody = z.object({
  policy: z.object({
    maxDiscountPct: z.number().min(0).max(0.5),
    agentLimitPct: z.number().min(0.5).max(1),
    openingDiscountPct: z.number().min(0).max(0.5),
    minProfitCents: cents,
    minMarginPct: z.number().min(0).max(0.6),
    concessionBudgetCents: cents,
    campaignBudgetCents: cents,
    incentiveAllocation: z.object({ warranty: z.number().min(0).max(1), express: z.number().min(0).max(1), shipping: z.number().min(0).max(1), bundle: z.number().min(0).max(1) }),
    active: z.boolean(),
    offerValidityMinutes: z.number().int().min(5).max(240),
  }),
  listings: z.array(
    z.object({
      id: z.string(),
      costCents: cents.min(100),
      listPriceCents: cents.min(100),
      maxSellingPriceCents: cents.min(100),
      floorPriceCents: cents.min(100),
      stock: z.number().int().min(0).max(10_000),
    }),
  ),
});

/** Validate and persist a merchant's commercial configuration (own data only). */
export async function saveConfig(merchantId: MerchantId, input: z.infer<typeof ConfigBody>): Promise<MerchantWorkspace> {
  const alloc = INCENTIVE_LEVERS.reduce((s, l) => s + input.policy.incentiveAllocation[l], 0);
  if (alloc > 1.0001) throw new NexusError("Incentive allocation can't exceed 100% of the campaign budget", 422);
  if (input.policy.openingDiscountPct > agentDiscountCap(input.policy) + 0.00001) {
    throw new NexusError("The opening discount can't be more than the agent limit allows (maximum discount × agent limit)", 422);
  }

  const current = await store.listListings();
  const errors: string[] = [];
  for (const l of input.listings) {
    const existing = current.find((c) => c.id === l.id);
    if (!existing || existing.merchantId !== merchantId) throw new NexusError("You can only edit your own listings", 403);
    const name = getProduct(existing.productId).name;
    if (l.floorPriceCents > l.listPriceCents) errors.push(`${name}: minimum selling price is above the asking price`);
    if (l.listPriceCents > l.maxSellingPriceCents) errors.push(`${name}: asking price is above the maximum selling price`);
    if (l.floorPriceCents < l.costCents) errors.push(`${name}: minimum selling price is below cost`);
  }
  if (errors.length) throw new NexusError(errors.join(". "), 422);

  const policy = await store.getPolicy(merchantId);
  await store.savePolicy(merchantId, { ...policy, ...input.policy });
  for (const l of input.listings) {
    const existing = current.find((c) => c.id === l.id)!;
    await store.saveListing({ ...existing, ...l });
  }
  return getWorkspace(merchantId);
}
