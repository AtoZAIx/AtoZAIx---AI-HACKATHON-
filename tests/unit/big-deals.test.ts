import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PLAN, type MoneyPlan } from "@/lib/nexus/budget";
import { getProduct } from "@/lib/nexus/catalog";
import { createVaultGoal, setCategory } from "@/lib/nexus/household";
import { extractBedrooms, parseIntentRules } from "@/lib/nexus/intent";
import { seedListings } from "@/lib/nexus/inventory";
import { createSession, lockDealAndPrepareOrder, streamNegotiation } from "@/lib/nexus/service";
import { checkPurchase, needsOverride } from "@/lib/nexus/spend-guard";
import { store } from "@/lib/nexus/store";
import { bookingToken, dealKind, termText } from "@/lib/nexus/vocab";

const D = (dollars: number) => dollars * 100;
const TODAY = new Date(2026, 10, 11);

beforeEach(async () => {
  await store.reset();
});

async function negotiateAndBook(text: string) {
  const { session } = await createSession(text);
  for await (const e of streamNegotiation(session.id)) void e;
  const done = (await store.getSession(session.id))!;
  const best = done.offers.find((o) => o.id === done.result!.recommendedOfferId)!;
  const { order } = await lockDealAndPrepareOrder(session.id, best.id);
  return { session: done, best, order };
}

describe("land, houses, rentals and cars: understanding the request", () => {
  it("finds the kind of deal and the bedrooms asked for", () => {
    expect(parseIntentRules("buy a house in Austin under $450,000 with 3 bedrooms").intent).toMatchObject({ category: "house", budgetCents: D(450_000), minBedrooms: 3 });
    expect(parseIntentRules("rent a 2 bedroom apartment under $2,200 a month").intent).toMatchObject({ category: "rental", budgetCents: D(2_200), minBedrooms: 2, quantity: 1 });
    expect(parseIntentRules("land plot under $200,000").intent).toMatchObject({ category: "land", minBedrooms: null });
    expect(parseIntentRules("buy a car under $40,000").intent?.category).toBe("car");
    expect(parseIntentRules("Toyota Camry under $30,000").intent?.targetProductId).toBe("toyota-camry-2026");
  });

  it("reads bedrooms written in different ways, and leaves gadgets alone", () => {
    expect(extractBedrooms("2-bed flat")).toBe(2);
    expect(extractBedrooms("three bedroom house")).toBe(3);
    expect(extractBedrooms("2 bhk")).toBe(2);
    expect(parseIntentRules("laptop for video editing under $1,800 with 32GB RAM").intent?.minBedrooms).toBeNull();
  });
});

describe("the refundable booking token", () => {
  it("is 1% for property (at least $1,000, at most $5,000), half a month for rent, $500 for a car, and nothing for goods", () => {
    expect(bookingToken("land", D(81_582))?.tokenCents).toBe(D(1_000));
    expect(bookingToken("house", D(400_673))?.tokenCents).toBe(D(4_007));
    expect(bookingToken("house", D(900_000))?.tokenCents).toBe(D(5_000));
    expect(bookingToken("rental", D(2_056))?.tokenCents).toBe(D(1_028));
    expect(bookingToken("car", D(29_116))?.tokenCents).toBe(D(500));
    expect(bookingToken("laptop", D(1_200))).toBeNull();
  });

  it("describes each kind of deal in its own words", () => {
    const t = { deliveryDays: 30, express: false, shippingCents: 0, warrantyMonths: 0, returnDays: 30 };
    expect(termText("house", t)).toMatchObject({ delivery: "possession in 30 days", fees: "seller pays closing fees", warranty: null, returns: "30-day cancellation window" });
    expect(termText("rental", t).delivery).toBe("move in within 30 days");
    expect(termText("car", { ...t, warrantyMonths: 36 }).warranty).toBe("3-year warranty");
    expect(termText("laptop", { ...t, warrantyMonths: 12, shippingCents: 0 })).toMatchObject({ fees: "free shipping", warranty: "12-month warranty" });
    expect(dealKind("headphones")).toBe("goods");
  });
});

describe("negotiating big-ticket deals end to end", () => {
  it("a house: meets the bedrooms, stays within the owner's floor, and PayPal takes only the token", async () => {
    const { session, best, order } = await negotiateAndBook("buy a house in Austin under $450,000 with 3 bedrooms");
    expect(getProduct(best.terms!.productId).specs.bedrooms).toBeGreaterThanOrEqual(3);
    const listings = seedListings();
    for (const o of session.offers.filter((x) => x.terms)) {
      const l = listings.find((x) => x.id === o.terms!.listingId)!;
      expect(l.sellerListing).toBe(true);
      expect(o.terms!.unitPriceCents).toBeGreaterThanOrEqual(l.floorPriceCents);
    }
    const token = bookingToken("house", best.totalCents!)!.tokenCents;
    expect(order).toMatchObject({ totalCents: token, subtotalCents: token, shippingCents: 0, booking: { dealTotalCents: best.totalCents, refundable: true } });
    expect(order.booking!.balanceDueCents + order.totalCents).toBe(best.totalCents);
    expect(order.lineItems[0].name).toMatch(/^Refundable booking token: /);
    expect(order.timeline.at(-1)?.label).toBe("Booking prepared");
  });

  it("a rental: a 2-bedroom ask gets a 2-bedroom home and a half-month token", async () => {
    const { best, order } = await negotiateAndBook("rent a 2 bedroom apartment under $2,200 a month");
    expect(getProduct(best.terms!.productId).specs.bedrooms).toBeGreaterThanOrEqual(2);
    expect(order.totalCents).toBe(Math.round(best.totalCents! / 2 / 100) * 100);
    expect(order.booking!.dealTotalCents).toBe(best.totalCents);
  });

  it("land and a car settle below the asking price with the right token", async () => {
    const land = await negotiateAndBook("land plot under $200,000");
    expect(land.best.terms!.unitPriceCents).toBeLessThan(land.best.terms!.listPriceCents);
    expect(land.order.totalCents).toBe(bookingToken("land", land.best.totalCents!)!.tokenCents);
    await store.reset();
    const car = await negotiateAndBook("Toyota Camry under $30,000");
    expect(car.best.terms!.productId).toBe("toyota-camry-2026");
    expect(car.order.totalCents).toBe(D(500));
  });
});

describe("the home page Try examples for big-ticket deals", () => {
  // Keep in step with SUGGESTIONS in nexus-command-input.tsx.
  const examples: Array<[string, string]> = [
    ["Buy a 3-bedroom house under $450,000", "house"],
    ["Rent a 2-bedroom apartment under $2,200 a month", "rental"],
    ["Land plot under $200,000", "land"],
    ["Toyota Camry under $30,000", "car"],
  ];
  for (const [text, category] of examples) {
    it(`"${text}" gets a ${category} deal with a booking token`, async () => {
      await store.reset();
      const { best, order } = await negotiateAndBook(text);
      expect(getProduct(best.terms!.productId).category).toBe(category);
      expect(best.totalCents!).toBeLessThanOrEqual(parseIntentRules(text).intent!.budgetCents!);
      expect(order.booking?.refundable).toBe(true);
    });
  }
});

describe("Spend Guard for bookings", () => {
  function plan(rent: number): MoneyPlan {
    let p: MoneyPlan = { ...EMPTY_PLAN, currency: "USD", salaryCents: D(8_000) };
    p = setCategory(p, { group: "Housing", name: "Rent", kind: "need", enteredCents: D(rent) });
    p = setCategory(p, { group: "Shopping", name: "Shopping", kind: "want", enteredCents: D(300) });
    return p;
  }
  const rental = (rent: number) => ({ productId: "rental-campus-2bed", productName: "2-bed", totalCents: D(rent / 2), booking: { kind: "rental" as const, dealTotalCents: D(rent), monthlyCents: D(rent) } });

  it("checks a rental's monthly rent against the Rent amount in your plan", () => {
    expect(checkPurchase(plan(2_200), rental(2_056), [], TODAY)).toMatchObject({ kind: "rent", fits: true, rentCents: D(2_056), budgetCents: D(2_200) });
    const over = checkPurchase(plan(1_800), rental(2_056), [], TODAY);
    expect(over).toMatchObject({ kind: "rent", fits: false, overCents: D(256) });
    expect(needsOverride(over)).toBe(true);
  });

  it("pays a house token from the House fund, and shows how much of the price it covers", () => {
    const house = createVaultGoal({ id: "h", name: "House", targetCents: D(80_000), savedCents: D(20_000), lockMonths: 60, priority: "high", stepUp: null }, "2026-11");
    const item = { productId: "house-maple-street", productName: "3-bed", totalCents: D(4_007), booking: { kind: "property" as const, dealTotalCents: D(400_673) } };
    const v = checkPurchase({ ...plan(1_500), goals: [house] }, item, [], TODAY);
    expect(v).toMatchObject({ kind: "goal", fits: true, goalName: "House", savedCents: D(20_000), dealCents: D(400_673) });
  });

  it("without a matching fund, a car token is checked against ENJOY like any purchase", () => {
    const item = { productId: "toyota-camry-2026", productName: "Camry", totalCents: D(500), booking: { kind: "vehicle" as const, dealTotalCents: D(29_116) } };
    const v = checkPurchase(plan(1_500), item, [], TODAY);
    expect(v).toMatchObject({ kind: "enjoy", fits: false, priceCents: D(500), leftCents: D(300), dealCents: D(29_116) });
  });
});
