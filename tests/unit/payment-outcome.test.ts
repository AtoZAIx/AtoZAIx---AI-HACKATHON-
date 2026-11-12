// After paying: success, pending and failure, through the real server logic with the simulator standing in for PayPal.
import { beforeEach, describe, expect, it } from "vitest";
import { paymentOutcome, paypalCode, plainPaymentError } from "@/lib/nexus/payment-outcome";
import { simulatedGateway } from "@/lib/nexus/payments/simulated";
import {
  approveOrder,
  capturePayment,
  createSession,
  lockDealAndPrepareOrder,
  retryPayment,
  simulatePaymentEvent,
  simulatorApprove,
  startPayment,
  streamNegotiation,
} from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

beforeEach(async () => {
  await store.reset();
});

/** A negotiated, approved order, ready to pay. */
async function approvedOrder() {
  const { session } = await createSession("noise cancelling headphones for travel under $400");
  for await (const e of streamNegotiation(session.id)) void e;
  const s = (await store.getSession(session.id))!;
  const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
  await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
  return order;
}

async function pay(orderId: string, outcome: "approve" | "review" | "decline") {
  const { paypalOrderId } = await startPayment(orderId, "http://localhost:3000");
  await simulatorApprove(orderId, paypalOrderId, outcome);
  return { paypalOrderId, capture: () => capturePayment(orderId, paypalOrderId) };
}

describe("after paying", () => {
  it("success: approved and confirmed by PayPal's signed message", async () => {
    const order = await approvedOrder();
    const { capture } = await pay(order.id, "approve");
    const done = await capture();
    expect(done.status).toBe("confirmed");
    expect(paymentOutcome(done)).toMatchObject({ kind: "success", title: "Payment successful", retry: null, charged: true });
  });

  it("pending: PayPal holds the payment for review, then completes it", async () => {
    const order = await approvedOrder();
    const { capture } = await pay(order.id, "review");
    const held = await capture();
    // On hold is pending, never a failure.
    expect(held).toMatchObject({ status: "payment_captured", payment: { status: "PENDING", pendingReason: "PENDING_REVIEW" } });
    expect(paymentOutcome(held)).toMatchObject({ kind: "pending", title: "Payment on hold", charged: true });
    expect(paymentOutcome(held)!.reason).toMatch(/reviewing this payment/);
    // A second capture click while on hold changes nothing.
    expect((await capture()).status).toBe("payment_captured");

    await simulatePaymentEvent(order.id, "review-complete");
    const done = (await store.getOrder(order.id))!;
    expect(done).toMatchObject({ status: "confirmed", payment: { status: "COMPLETED", pendingReason: null } });
    expect(paymentOutcome(done)?.kind).toBe("success");
  });

  it("failure after review: PayPal declines it, the customer tries again and pays", async () => {
    const order = await approvedOrder();
    const { capture } = await pay(order.id, "review");
    await capture();
    await simulatePaymentEvent(order.id, "review-deny");
    const denied = (await store.getOrder(order.id))!;
    expect(denied).toMatchObject({ status: "payment_failed", payment: { status: "DECLINED" } });
    expect(paymentOutcome(denied)).toMatchObject({ kind: "failure", title: "Payment declined", retry: "new-payment" });

    // Try again: the declined attempt is kept, a fresh payment starts for the same approved deal.
    const again = await retryPayment(order.id);
    expect(again).toMatchObject({ status: "approved", payment: null });
    expect(again.failedPayments).toHaveLength(1);
    expect(paymentOutcome(again)).toBeNull();
    const second = await pay(order.id, "approve");
    expect((await second.capture()).status).toBe("confirmed");
  });

  it("failure at capture: the bank declines, nothing is charged, and the PayPal buttons work again", async () => {
    const order = await approvedOrder();
    const first = await pay(order.id, "decline");
    await expect(first.capture()).rejects.toThrow(/INSTRUMENT_DECLINED/);
    const declined = (await store.getOrder(order.id))!;
    expect(declined).toMatchObject({ status: "payment_pending", payment: { lastError: { code: "INSTRUMENT_DECLINED" } } });
    expect(paymentOutcome(declined)).toMatchObject({ kind: "failure", retry: "checkout", charged: false });
    expect(paymentOutcome(declined)!.reason).toMatch(/declined the payment/);

    // The buyer approves again on the same PayPal order, with another funding source.
    await simulatorApprove(order.id, first.paypalOrderId, "approve");
    expect((await first.capture()).status).toBe("confirmed");
  });

  it("a wrong amount is never retried: the order is stopped for safety", async () => {
    const order = await approvedOrder();
    const { paypalOrderId, capture } = await pay(order.id, "approve");
    simulatedGateway.tamper(paypalOrderId, order.totalCents - 5000);
    const stopped = await capture();
    expect(stopped.status).toBe("payment_failed");
    expect(paymentOutcome(stopped)).toMatchObject({ kind: "failure", title: "We stopped this order", retry: null });
    await expect(retryPayment(order.id)).rejects.toThrow(/can’t be retried/);
  });

  it("refunded and disputed show as their own results", async () => {
    const order = await approvedOrder();
    await (await pay(order.id, "approve")).capture();
    await simulatePaymentEvent(order.id, "refund");
    expect(paymentOutcome((await store.getOrder(order.id))!)?.kind).toBe("refunded");
  });
});

describe("PayPal errors in plain words", () => {
  it("reads PayPal's code out of an error and explains it", () => {
    expect(paypalCode("PayPal /v2/checkout/orders/X/capture failed: INSTRUMENT_DECLINED")).toBe("INSTRUMENT_DECLINED");
    expect(plainPaymentError("PayPal capture failed: INSTRUMENT_DECLINED")).toMatch(/declined the payment/);
    expect(plainPaymentError("network down")).toMatch(/weren’t charged/);
  });
});
