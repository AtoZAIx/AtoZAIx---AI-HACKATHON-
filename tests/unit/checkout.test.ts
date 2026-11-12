import { beforeEach, describe, expect, it } from "vitest";
import { buildOrderBody } from "@/lib/nexus/payments/paypal";
import { simulatedGateway } from "@/lib/nexus/payments/simulated";
import { parsePayPalValue } from "@/lib/nexus/money";
import {
  approveOrder,
  capturePayment,
  createSession,
  lockDealAndPrepareOrder,
  processWebhook,
  simulateForgedWebhook,
  simulatorApprove,
  startPayment,
  streamNegotiation,
} from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

async function negotiated(text = "laptop for video editing under $1,800 with 32GB RAM") {
  const { session, action } = await createSession(text);
  expect(action.type).toBe("negotiate");
  for await (const e of streamNegotiation(session.id)) void e;
  const s = (await store.getSession(session.id))!;
  expect(s.status).toBe("negotiated");
  return s;
}

async function lockedOrder() {
  const s = await negotiated();
  const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
  return order;
}

async function paidThroughSimulator(orderId: string) {
  const { order, paypalOrderId } = await startPayment(orderId, "http://localhost:3000");
  await simulatorApprove(order.id, paypalOrderId);
  return { paypalOrderId };
}

beforeEach(async () => {
  await store.reset();
});

describe("deal verification", () => {
  it("locks the recommended deal, reserves stock and prepares an order", async () => {
    const s = await negotiated();
    const offer = s.offers.find((o) => o.id === s.result!.recommendedOfferId)!;
    const before = (await store.getListing(offer.terms!.listingId))!.stock;
    const { agreement, order } = await lockDealAndPrepareOrder(s.id, offer.id);
    expect(agreement.verification.ok).toBe(true);
    expect(agreement.verification.checks.every((c) => c.status === "pass")).toBe(true);
    expect(order.status).toBe("awaiting_approval");
    expect(order.totalCents).toBe(offer.totalCents);
    expect((await store.getListing(offer.terms!.listingId))!.stock).toBe(before - 1);
  });

  it("refuses a superseded (non-binding) offer", async () => {
    const s = await negotiated();
    const best = s.offers.find((o) => o.id === s.result!.recommendedOfferId)!;
    const stale = s.offers.find((o) => o.merchantId === best.merchantId && o.kind === "opening")!;
    await expect(lockDealAndPrepareOrder(s.id, stale.id)).rejects.toThrow(/binding offer/);
  });

  it("refuses when stock ran out after negotiation", async () => {
    const s = await negotiated();
    const best = s.offers.find((o) => o.id === s.result!.recommendedOfferId)!;
    const listing = (await store.getListing(best.terms!.listingId))!;
    await store.reserveStock(listing.id, listing.stock);
    await expect(lockDealAndPrepareOrder(s.id, best.id)).rejects.toThrow(/inventory available/i);
  });
});

describe("approval and payment", () => {
  it("only accepts approval of the exact amount and terms", async () => {
    const order = await lockedOrder();
    await expect(approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents - 100, agreementVersion: order.agreementVersion }, { stepUp: "passkey" })).rejects.toThrow(/doesn't match/);
    await expect(approveOrder(order.id, { termsHash: "0".repeat(64), amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" })).rejects.toThrow(/doesn't match/);
    await expect(startPayment(order.id, "http://localhost")).rejects.toThrow(/Approve the order/);
    const approved = await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    expect(approved.status).toBe("approved");
  });

  it("confirms only after capture and webhook verification", async () => {
    const order = await lockedOrder();
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await paidThroughSimulator(order.id);
    const done = await capturePayment(order.id, paypalOrderId);
    expect(done.status).toBe("confirmed");
    expect(done.payment!.verification!.checks.every((c) => c.status === "pass")).toBe(true);
    expect(done.payment!.webhooks.some((w) => w.signatureVerified)).toBe(true);
  });

  it("will not capture before the buyer approves on PayPal", async () => {
    const order = await lockedOrder();
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await startPayment(order.id, "http://localhost");
    await expect(capturePayment(order.id, paypalOrderId)).rejects.toThrow(/ORDER_NOT_APPROVED/);
  });

  it("fails verification when the captured amount differs", async () => {
    const order = await lockedOrder();
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await paidThroughSimulator(order.id);
    simulatedGateway.tamper(paypalOrderId, order.totalCents - 5000);
    const done = await capturePayment(order.id, paypalOrderId);
    expect(done.status).toBe("payment_failed");
    expect(done.payment!.verification!.checks.find((c) => c.id === "amount")!.status).toBe("fail");
  });

  it("rejects forged webhooks and ignores duplicates", async () => {
    const order = await lockedOrder();
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await paidThroughSimulator(order.id);
    await capturePayment(order.id, paypalOrderId);
    expect((await simulateForgedWebhook(order.id)).status).toBe(401);

    const view = await simulatedGateway.getOrder(paypalOrderId);
    const hook = simulatedGateway.buildWebhook(view);
    expect((await processWebhook(hook.headers, hook.body)).status).toBe(200);
    // An exact replay (same transmission) is rejected; a genuine re-delivery of the same event is ignored.
    expect((await processWebhook(hook.headers, hook.body)).status).toBe(409);
    expect((await processWebhook(simulatedGateway.signHeaders(hook.body), hook.body)).detail).toMatch(/Duplicate/);
    expect((await store.getOrder(order.id))!.status).toBe("confirmed");
  });
});

describe("PayPal order body", () => {
  it("has a breakdown that sums to the total and links the AtoZAIx order", async () => {
    const order = await lockedOrder();
    const body = buildOrderBody({ order, merchantName: "Bolt", productName: "Vertex", payee: null, returnUrl: "http://x/r", cancelUrl: "http://x/c" });
    const unit = body.purchase_units[0];
    const total = parsePayPalValue(unit.amount.value);
    const parts = parsePayPalValue(unit.amount.breakdown.item_total.value) + parsePayPalValue(unit.amount.breakdown.shipping.value);
    expect(total).toBe(order.totalCents);
    expect(parts).toBe(total);
    expect(unit.custom_id).toBe(order.id);
    expect(unit.invoice_id).toBe(`ATOZAIX-${order.id}`);
    expect(body.intent).toBe("CAPTURE");
  });
});

describe("chat follow-ups", () => {
  it("locks a named merchant from chat", async () => {
    const { session } = await createSession("laptop for video editing under $1,800 with 32GB RAM");
    for await (const e of streamNegotiation(session.id)) void e;
    const { postChat } = await import("@/lib/nexus/service");
    const res = await postChat(session.id, "go with Cove");
    expect(res.action.type).toBe("order");
    const s = (await store.getSession(session.id))!;
    expect(s.agreement!.merchantId).toBe("cove");
  });

  it("asks a clarifying question when the category is unknown", async () => {
    const { session, action } = await createSession("I want something under $500");
    expect(action.type).toBe("none");
    expect(session.chat.at(-1)!.text).toMatch(/What are you shopping for/);
  });
});
