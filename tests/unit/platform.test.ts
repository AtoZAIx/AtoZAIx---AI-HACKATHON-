import { beforeEach, describe, expect, it } from "vitest";
import { negotiate } from "@/lib/nexus/agents/coordinator";
import { parseIntentRules } from "@/lib/nexus/intent";
import { seedListings } from "@/lib/nexus/inventory";
import { checkPasscode, issueToken, readToken } from "@/lib/nexus/merchant-auth";
import { getWorkspace, saveConfig } from "@/lib/nexus/merchant-workspace";
import { MERCHANTS } from "@/lib/nexus/merchants";
import {
  approveOrder,
  capturePayment,
  createSession,
  liveMerchants,
  lockDealAndPrepareOrder,
  postChat,
  simulatePaymentEvent,
  simulatorApprove,
  startPayment,
  streamNegotiation,
} from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";
import type { MerchantProfile, NegotiationEvent, Offer } from "@/lib/nexus/types";

beforeEach(async () => {
  await store.reset();
});

async function run(text: string, merchants?: Record<string, MerchantProfile>) {
  const intent = parseIntentRules(text).intent!;
  const offers: Offer[] = [];
  for await (const e of negotiate(intent, seedListings(), { paceMs: 0, merchants: merchants as never })) if (e.type === "offer") offers.push((e as Extract<NegotiationEvent, { type: "offer" }>).offer);
  return offers;
}

async function negotiated(text = "laptop for video editing under $1,800 with 32GB RAM") {
  const { session } = await createSession(text);
  for await (const e of streamNegotiation(session.id)) void e;
  return (await store.getSession(session.id))!;
}

describe("merchant commercial guardrails", () => {
  it("never sells below cost plus minimum profit", async () => {
    const strict = { ...MERCHANTS.bolt, policy: { ...MERCHANTS.bolt.policy, minProfitCents: 30000 } };
    const offers = await run("laptop for video editing under $1,800 with 32GB RAM", { ...MERCHANTS, bolt: strict });
    const listings = seedListings();
    for (const o of offers.filter((x) => x.merchantId === "bolt" && x.terms)) {
      const l = listings.find((x) => x.id === o.terms!.listingId)!;
      expect(o.terms!.unitPriceCents).toBeGreaterThanOrEqual(l.costCents + 30000);
    }
  });

  it("stops discounting when the concession budget is exhausted", async () => {
    const broke = {
      ...MERCHANTS.bolt,
      policy: { ...MERCHANTS.bolt.policy, remaining: { concessionCents: 0, incentiveCents: { warranty: 0, express: 0, shipping: 0, bundle: 0 } } },
    };
    const offers = await run("laptop for video editing under $1,800 with 32GB RAM", { ...MERCHANTS, bolt: broke });
    for (const o of offers.filter((x) => x.merchantId === "bolt" && x.terms)) {
      expect(o.terms!.unitPriceCents).toBe(o.terms!.listPriceCents);
      expect(o.terms!.shippingCents).toBe(o.terms!.listShippingCents);
    }
  });

  it("a paused merchant declines every RFQ", async () => {
    const paused = { ...MERCHANTS.atelier, policy: { ...MERCHANTS.atelier.policy, active: false } };
    const offers = await run("laptop for video editing under $1,800 with 32GB RAM", { ...MERCHANTS, atelier: paused });
    expect(offers.filter((o) => o.merchantId === "atelier").map((o) => o.kind)).toEqual(["declined"]);
  });

  it("numbers offer versions per merchant", async () => {
    const offers = await run("laptop for video editing under $1,800 with 32GB RAM");
    const bolt = offers.filter((o) => o.merchantId === "bolt").map((o) => o.version);
    expect(bolt).toEqual(bolt.map((_, i) => i + 1));
  });
});

describe("three-state verification", () => {
  it("passes with an advisory UNKNOWN when no spending limit was set", async () => {
    const s = await negotiated("Find the best deal on the AirPods Pro 3");
    const { agreement } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    const budget = agreement.verification.checks.find((c) => c.id === "budget")!;
    expect(budget.status).toBe("unknown");
    expect(budget.essential).toBe(false);
    expect(agreement.verification.ok).toBe(true);
    for (const c of agreement.verification.checks) {
      expect(c.evidence).toBeInstanceOf(Array);
      expect(c.checkedAt).toMatch(/T/);
    }
  });

  it("never exposes confidential merchant values in check evidence", async () => {
    const s = await negotiated();
    const { agreement } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    const listing = (await store.getListing(agreement.terms.listingId))!;
    const text = JSON.stringify(agreement.verification);
    expect(text).not.toContain(String(listing.costCents / 100));
    expect(text).not.toContain(String(listing.floorPriceCents / 100));
  });
});

describe("approval is bound to the agreement version", () => {
  it("re-negotiating supersedes the old approval, releasing stock and budget", async () => {
    const s = await negotiated();
    const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    expect(order.agreementVersion).toBe(1);
    const before = await store.remainingBudget(order.merchantId);

    await postChat(s.id, "make the budget $1,700 instead");
    const cancelled = (await store.getOrder(order.id))!;
    expect(cancelled.status).toBe("cancelled");
    const after = await store.remainingBudget(order.merchantId);
    expect(after.concessionCents).toBeGreaterThan(before.concessionCents);
    await expect(approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: 1 })).rejects.toThrow();

    for await (const e of streamNegotiation(s.id)) void e;
    const again = (await store.getSession(s.id))!;
    const second = await lockDealAndPrepareOrder(again.id, again.result!.recommendedOfferId!);
    expect(second.order.agreementVersion).toBe(2);
    await expect(approveOrder(second.order.id, { termsHash: second.order.termsHash, amountCents: second.order.totalCents, agreementVersion: 1 })).rejects.toThrow(/doesn't match/);
    expect((await approveOrder(second.order.id, { termsHash: second.order.termsHash, amountCents: second.order.totalCents, agreementVersion: 2 })).status).toBe("approved");
  });
});

describe("payment lifecycle", () => {
  async function paid() {
    const s = await negotiated();
    const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion });
    const { paypalOrderId } = await startPayment(order.id, "http://localhost:3000");
    await simulatorApprove(order.id, paypalOrderId);
    return capturePayment(order.id, paypalOrderId);
  }

  it("records every lifecycle state and commits the merchant ledger", async () => {
    const order = await paid();
    expect(order.status).toBe("confirmed");
    expect(order.payment!.lifecycle.map((e) => e.state)).toEqual(["created", "awaiting_approval", "approved", "capturing", "captured"]);
    const ledger = await store.ledger(order.merchantId);
    expect(ledger.map((e) => e.type)).toEqual(["reserve", "commit"]);
  });

  it("moves to refunded and disputed only on signed webhooks", async () => {
    const order = await paid();
    expect((await simulatePaymentEvent(order.id, "refund")).status).toBe(200);
    expect((await store.getOrder(order.id))!.status).toBe("refunded");
    expect((await simulatePaymentEvent(order.id, "dispute")).status).toBe(200);
    const o = (await store.getOrder(order.id))!;
    expect(o.status).toBe("disputed");
    expect(o.payment!.lifecycle.map((e) => e.state).slice(-2)).toEqual(["refunded", "disputed"]);
  });
});

describe("merchant role access", () => {
  it("issues tokens that can't be forged, swapped or replayed after expiry", () => {
    const token = issueToken("bolt");
    expect(readToken(token)).toBe("bolt");
    expect(readToken(token.replace(/^bolt/, "cove"))).toBeNull();
    // Flip the last signature character (always to a different one).
    expect(readToken(`${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`)).toBeNull();
    expect(readToken(issueToken("bolt", Date.now() - 9 * 3600_000))).toBeNull();
    expect(readToken(undefined)).toBeNull();
  });

  it("uses the dev passcode only outside production", () => {
    expect(checkPasscode("bolt", "nexus-dev")).toBe(true);
    expect(checkPasscode("bolt", "wrong")).toBe(false);
  });

  it("saves configuration that changes live negotiation behaviour", async () => {
    const ws = await getWorkspace("bolt");
    await saveConfig("bolt", { policy: { ...ws.policy, active: false }, listings: [] });
    expect((await liveMerchants()).bolt.policy.active).toBe(false);
    const s = await negotiated();
    expect(s.offers.filter((o) => o.merchantId === "bolt").map((o) => o.kind)).toEqual(["declined"]);
  });

  it("rejects inconsistent pricing and edits to other merchants' listings", async () => {
    const ws = await getWorkspace("bolt");
    const l = ws.listings[0];
    await expect(saveConfig("bolt", { policy: ws.policy, listings: [{ ...l, floorPriceCents: l.costCents - 100 }] })).rejects.toThrow(/below cost/);
    const other = (await getWorkspace("cove")).listings[0];
    await expect(saveConfig("bolt", { policy: ws.policy, listings: [other] })).rejects.toThrow(/your own listings/);
  });
});

describe("customer payloads", () => {
  it("contain no confidential merchant fields", async () => {
    const s = await negotiated();
    const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    const json = JSON.stringify({ session: await store.getSession(s.id), order });
    for (const key of ["floorPriceCents", "costCents", "minProfitCents", "minMarginPct", "concessionBudgetCents", "maxDiscountPct", "agentLimitPct", "openingDiscountPct"]) {
      expect(json).not.toContain(key);
    }
  });
});
