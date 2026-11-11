import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ASK_PCT } from "@/lib/nexus/agents/buyer";
import { agentDiscountCap, itemDiscountCap, minimumUnitPrice, mutualDeal } from "@/lib/nexus/agents/pricing";
import { extractAskDiscount, extractBudget, parseIntentRules } from "@/lib/nexus/intent";
import { getWorkspace, saveConfig } from "@/lib/nexus/merchant-workspace";
import { createSession, streamNegotiation } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";
import { SEED_POLICIES } from "@/lib/nexus/merchants";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import type { Listing, MerchantPolicy, MerchantProfile, OfferTerms } from "@/lib/nexus/types";

const LIST = 100_000; // $1,000

function fixture(policy: Partial<MerchantPolicy> = {}, listing: Partial<Listing> = {}) {
  const merchant: MerchantProfile = {
    ...MERCHANT_DIRECTORY.bolt,
    policy: { ...SEED_POLICIES.bolt, maxDiscountPct: 0.5, agentLimitPct: 0.8, openingDiscountPct: 0.2, minProfitCents: 0, minMarginPct: 0, remaining: undefined, ...policy },
  };
  const l: Listing = {
    id: "lst_test",
    merchantId: "bolt",
    productId: "macbook-air-13-m4",
    listPriceCents: LIST,
    floorPriceCents: 10_000,
    stock: 5,
    baseWarrantyMonths: 12,
    maxWarrantyMonths: 36,
    warrantyCostPerYearCents: 5_000,
    costCents: 10_000,
    maxSellingPriceCents: LIST,
    standardDeliveryDays: 3,
    expressDeliveryDays: 1,
    expressCostCents: 2_000,
    shippingCents: 0,
    ...listing,
  };
  const terms: OfferTerms = {
    listingId: l.id,
    merchantId: "bolt",
    productId: l.productId,
    quantity: 1,
    currency: "USD",
    listPriceCents: LIST,
    unitPriceCents: LIST,
    shippingCents: 0,
    listShippingCents: 0,
    warrantyMonths: 12,
    deliveryDays: 3,
    express: false,
    returnDays: 15,
    bundle: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  return { merchant, listing: l, terms };
}

describe("mutual deal", () => {
  it("meets in the middle: max 50%, opening 20%, shopper asks 30% → 25%", () => {
    const { merchant, listing, terms } = fixture();
    const d = mutualDeal(merchant, listing, terms, 0.3);
    expect(d.unitPriceCents).toBe(75_000);
    expect(d.discountPct).toBeCloseTo(0.25);
    expect(d.askMet).toBe(false);
  });

  it("never goes past the agent limit: 80% of a 50% maximum is 40%", () => {
    const { merchant, listing, terms } = fixture();
    expect(agentDiscountCap(merchant.policy)).toBeCloseTo(0.4);
    expect(minimumUnitPrice(merchant, listing, terms)).toBe(60_000);
    // A 60% ask can't be reached: meet halfway between the 20% opening and the 40% limit.
    const d = mutualDeal(merchant, listing, terms, 0.6);
    expect(d.discountPct).toBeCloseTo(0.3);
    expect(d.limitPct).toBeCloseTo(0.4);
  });

  it("gives the opening when the shopper asks for less than the store opens with", () => {
    const { merchant, listing, terms } = fixture();
    const d = mutualDeal(merchant, listing, terms, 0.1);
    expect(d.discountPct).toBeCloseTo(0.2);
    expect(d.askMet).toBe(true);
  });

  it("respects stricter floors like minimum profit before the agent limit", () => {
    // Cost $700 + $80 minimum profit: the store can't go below $780 (22% off).
    const { merchant, listing, terms } = fixture({ minProfitCents: 8_000 }, { costCents: 70_000, floorPriceCents: 70_000 });
    const d = mutualDeal(merchant, listing, terms, 0.3);
    expect(d.limitPct).toBeCloseTo(0.22);
    expect(d.unitPriceCents).toBe(79_000); // halfway between 20% and 22%
  });
});

describe("shopper's discount ask", () => {
  it("reads “X% off” without mistaking it for a budget", () => {
    expect(extractAskDiscount("MacBook Air 13 M4, 30% off")).toBeCloseTo(0.3);
    expect(extractAskDiscount("a discount of 15 percent on AirPods")).toBeCloseTo(0.15);
    expect(extractAskDiscount("laptop under $900")).toBeNull();
    expect(extractBudget("around 30% off a MacBook Air")).toBeNull();
    const parsed = parseIntentRules("MacBook Air 13 M4 under $1,100, 10% off");
    expect(parsed.intent?.askDiscountPct).toBeCloseTo(0.1);
    expect(parsed.intent?.budgetCents).toBe(110_000);
    expect(parsed.intent?.summary).toContain("asking 10% off");
  });
});

describe("mutual negotiation end to end", () => {
  beforeEach(async () => {
    await store.reset();
  });

  async function negotiate(text: string) {
    const { session } = await createSession(text);
    for await (const e of streamNegotiation(session.id)) void e;
    return (await store.getSession(session.id))!;
  }
  const off = (o: { terms: { unitPriceCents: number; listPriceCents: number } | null }) => 1 - o.terms!.unitPriceCents / o.terms!.listPriceCents;
  const finalsOf = (s: Awaited<ReturnType<typeof negotiate>>) => {
    const last = new Map<string, (typeof s.offers)[number]>();
    for (const o of s.offers) if (o.terms) last.set(o.merchantId, o);
    return [...last.values()];
  };

  it("your example, live: a 50% clearance item, a 30% ask, closes at 25%", async () => {
    const s = await negotiate("Bose QuietComfort Ultra, 30% off");
    const [cove] = finalsOf(s);
    expect(cove.merchantId).toBe("cove");
    expect(off(s.offers.find((o) => o.merchantId === "cove" && o.kind === "opening")!)).toBeCloseTo(0.2, 2);
    expect(off(cove)).toBeCloseTo(0.25, 2);
    expect(cove.message).toMatch(/meet in the middle/);
  });

  it("settles each store halfway between its opening and the ask, within its limit", async () => {
    const s = await negotiate("MacBook Air 13 M4, 10% off");
    const listings = await store.listListings();
    for (const o of finalsOf(s)) {
      const policy = await store.getPolicy(o.merchantId);
      const listing = listings.find((l) => l.id === o.terms!.listingId)!;
      expect(off(o)).toBeLessThanOrEqual(itemDiscountCap(policy, listing) + 1e-9);
      expect(o.kind).toBe("final");
    }
  });

  it("never makes naming a discount the worse choice", async () => {
    for (const product of ["MacBook Air 13 M4", "Bose QuietComfort Ultra", "iPhone 17 Pro"]) {
      await store.reset();
      const plain = Math.max(...finalsOf(await negotiate(product)).map(off));
      for (const ask of [5, 15, 30]) {
        await store.reset();
        const named = Math.max(...finalsOf(await negotiate(`${product}, ${ask}% off`)).map(off));
        expect(named, `${product} at ${ask}%`).toBeGreaterThanOrEqual(plain - 1e-9);
      }
    }
    expect(DEFAULT_ASK_PCT).toBe(0.2);
  });

  it("keeps every negotiation within each item's agent limit", async () => {
    for (const text of ["Find the best laptop under $900", "Best price on iPhone 17 Pro", "Compare wireless headphones"]) {
      const s = await negotiate(text);
      const listings = await store.listListings();
      for (const o of s.offers.filter((x) => x.terms)) {
        const policy = await store.getPolicy(o.merchantId);
        const listing = listings.find((l) => l.id === o.terms!.listingId)!;
        expect(off(o)).toBeLessThanOrEqual(itemDiscountCap(policy, listing) + 1e-9);
        expect(off(o)).toBeLessThanOrEqual(agentDiscountCap({ ...policy, maxDiscountPct: listing.maxDiscountPct ?? policy.maxDiscountPct }) + 1e-9);
      }
    }
  });

  it("rejects an opening discount above what the agent limit allows", async () => {
    const ws = await getWorkspace("bolt");
    await expect(saveConfig("bolt", { policy: { ...ws.policy, maxDiscountPct: 0.1, agentLimitPct: 0.8, openingDiscountPct: 0.09 }, listings: [] })).rejects.toThrow(/opening discount/);
  });
});

describe("premium store names in chat", () => {
  it("picks stores by their new names, and still by the old ones", async () => {
    const { classifyFollowUpRules } = await import("@/lib/nexus/agents/llm");
    const session = { result: { ranking: [{ merchantId: "bolt", totalCents: 1 }] } } as unknown as Parameters<typeof classifyFollowUpRules>[1];
    expect(classifyFollowUpRules("go with Vantage", session)).toEqual({ action: "choose", merchantId: "bolt" });
    expect(classifyFollowUpRules("I'll take Maison Aurum", session)).toEqual({ action: "choose", merchantId: "atelier" });
    expect(classifyFollowUpRules("go with Bolt", session)).toEqual({ action: "choose", merchantId: "bolt" });
    expect(MERCHANT_DIRECTORY.atelier.name).toBe("Maison Aurum");
    expect(MERCHANT_DIRECTORY.bolt.name).toBe("Vantage Market");
  });
});
