import { describe, expect, it } from "vitest";
import { buildCounter, rankOffers } from "@/lib/nexus/agents/buyer";
import { negotiate } from "@/lib/nexus/agents/coordinator";
import { openingOffer, respondToCounter, selectListing } from "@/lib/nexus/agents/merchant";
import { minimumUnitPrice, mutualDeal } from "@/lib/nexus/agents/pricing";
import { getProduct } from "@/lib/nexus/catalog";
import { formatMoney } from "@/lib/nexus/money";
import { parseIntentRules } from "@/lib/nexus/intent";
import { seedListings } from "@/lib/nexus/inventory";
import { MERCHANTS } from "@/lib/nexus/merchants";
import type { NegotiationEvent, Offer, PurchaseIntent } from "@/lib/nexus/types";

const BRIEFS = [
  "I need a laptop for video editing under $1,800 with 32GB RAM",
  "lightweight laptop for programming, budget $1,200, fast delivery",
  "cheapest noise cancelling headphones for travel under $350",
  "gaming laptop under 1500",
  "4k monitor for photo editing with a long warranty, budget 600",
  "tablet for school around $500, best value",
];

async function run(text: string) {
  const intent = parseIntentRules(text).intent!;
  const events: NegotiationEvent[] = [];
  for await (const e of negotiate(intent, seedListings(), { paceMs: 0 })) events.push(e);
  return { intent, events };
}

describe("negotiation protocol", () => {
  it.each(BRIEFS)("respects every merchant policy: %s", async (text) => {
    const { intent, events } = await run(text);
    const listings = seedListings();
    const offers = events.filter((e): e is Extract<NegotiationEvent, { type: "offer" }> => e.type === "offer").map((e) => e.offer);
    const byMerchant = new Map<string, Offer[]>();
    for (const o of offers) byMerchant.set(o.merchantId, [...(byMerchant.get(o.merchantId) ?? []), o]);

    for (const [merchantId, list] of byMerchant) {
      const merchant = MERCHANTS[merchantId as keyof typeof MERCHANTS];
      let prev = Infinity;
      for (const o of list) {
        if (!o.terms) continue;
        const listing = listings.find((l) => l.id === o.terms!.listingId)!;
        // Never below the merchant's margin floor (after paying for concessions).
        expect(o.terms.unitPriceCents).toBeGreaterThanOrEqual(minimumUnitPrice(merchant, listing, o.terms));
        // Prices only move down.
        expect(o.terms.unitPriceCents).toBeLessThanOrEqual(prev);
        prev = o.terms.unitPriceCents;
        expect(o.terms.warrantyMonths).toBeLessThanOrEqual(listing.maxWarrantyMonths);
      }
    }

    // The buyer's private budget never appears in merchant-facing messages.
    if (intent.budgetCents) {
      const budget = formatMoney(intent.budgetCents);
      const merchantFacing = events.flatMap((e) => (e.type === "message" && e.message.to !== "coordinator" ? [e.message.text] : []));
      expect(merchantFacing.some((t) => t.includes(budget))).toBe(false);
    }

    const result = events.find((e): e is Extract<NegotiationEvent, { type: "result" }> => e.type === "result")!.result;
    expect(result.ranking.length).toBeGreaterThan(0);
    expect(result.recommendedOfferId).toBe(result.ranking[0].offerId);
  });

  it("prefers the cheaper deal on a balanced brief and warranty on a warranty brief", async () => {
    const balanced = await run("laptop for video editing under $1,800 with 32GB RAM");
    const r1 = balanced.events.find((e) => e.type === "result")!;
    expect(r1.type === "result" && r1.result.ranking[0].merchantId).toBe("bolt");

    const warranty = await run("laptop for video editing under $1,800 with 32GB RAM, I care most about warranty");
    const r2 = warranty.events.find((e) => e.type === "result")!;
    expect(r2.type === "result" && r2.result.ranking[0].merchantId).not.toBe("bolt");
  });

  it("declines when a merchant can't meet the requirements", async () => {
    const { events } = await run("Find me the best deal on the Bose QuietComfort Ultra");
    const offers = events.flatMap((e) => (e.type === "offer" ? [e.offer] : []));
    expect(offers.filter((o) => o.kind === "declined").map((o) => o.merchantId).sort()).toEqual(["atelier", "bolt"]);
  });
});

describe("branded requests", () => {
  it("only offers products from the brand and line the shopper asked for", async () => {
    for (const [text, brand, family] of [
      ["I want a MacBook Pro for video editing under $2,000", "Apple", "MacBook Pro"],
      ["Samsung phone under $900", "Samsung", null],
      ["an iPhone with the longest warranty", "Apple", "iPhone"],
    ] as const) {
      const { events } = await run(text);
      const offers = events.flatMap((e) => (e.type === "offer" && e.offer.terms ? [e.offer] : []));
      expect(offers.length, text).toBeGreaterThan(0);
      for (const o of offers) {
        const p = getProduct(o.terms!.productId);
        expect(p.brand, text).toBe(brand);
        if (family) expect(p.family, text).toBe(family);
      }
    }
  });
});

describe("policy enforcement on LLM proposals", () => {
  const intent: PurchaseIntent = parseIntentRules("laptop for video editing under $1,800 with 32GB RAM").intent!;
  const listings = seedListings();

  function setup() {
    const merchant = MERCHANTS.atelier;
    const listing = selectListing(merchant, listings, { intent, targetTotalCents: 150000 })!;
    const { state, offer } = openingOffer(merchant, listing, { intent, targetTotalCents: 150000 });
    const counter = buildCounter(offer, [offer], intent, 1);
    return { merchant, listing, state, counter };
  }

  it("clamps a too-low AI price to the mutual deal, never below the floor", () => {
    const { merchant, listing, state, counter } = setup();
    const offer = respondToCounter(state, counter, { round: 1, maxRounds: 3, askDiscountPct: 0.2, proposal: { unitPriceCents: 100, message: "Fine, $1." } });
    expect(offer.terms!.unitPriceCents).toBe(mutualDeal(merchant, listing, offer.terms!, 0.2).unitPriceCents);
    expect(offer.terms!.unitPriceCents).toBeGreaterThanOrEqual(minimumUnitPrice(merchant, listing, offer.terms!));
    expect(offer.strategy).toBe("gemini+policy");
    // The narration claimed $1, which doesn't match the terms, so it was replaced.
    expect(offer.message).not.toContain("$1.");
  });

  it("refuses warranty beyond the listing maximum", () => {
    const { listing, state, counter } = setup();
    const offer = respondToCounter(state, counter, { round: 1, maxRounds: 3, proposal: { addWarrantyMonths: 24, unitPriceCents: state.terms.unitPriceCents } });
    expect(offer.terms!.warrantyMonths).toBeLessThanOrEqual(listing.maxWarrantyMonths);
  });

  it("ranks over-budget offers below in-budget ones", () => {
    const { state } = setup();
    const atelier = respondToCounter(state, buildCounter(openingOffer(MERCHANTS.atelier, state.listing, { intent, targetTotalCents: null }).offer, [], intent, 1), {
      round: 3,
      maxRounds: 3,
    });
    const tight = { ...intent, budgetCents: atelier.totalCents! - 100 };
    const ranked = rankOffers([atelier], tight);
    expect(ranked[0].withinBudget).toBe(false);
  });
});
