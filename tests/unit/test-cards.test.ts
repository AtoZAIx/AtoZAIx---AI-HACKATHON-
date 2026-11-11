import { beforeEach, describe, expect, it } from "vitest";
import {
  accountUpdate,
  amountResult,
  avsMatch,
  cvvMatch,
  DEFAULT_CARD_SETTINGS,
  evaluateTestCard,
  validExpiry,
  type CardTestSettings,
  type ProcessorId,
} from "@/lib/nexus/payments/test-cards";
import {
  approveOrder,
  createSession,
  lockDealAndPrepareOrder,
  simulatorPayByCard,
  startPayment,
  streamNegotiation,
} from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

const NOW = new Date("2026-11-09T12:00:00Z");
const settings = (patch: Partial<CardTestSettings> = {}): CardTestSettings => ({ ...DEFAULT_CARD_SETTINGS, ...patch });
const card = (number: string, amountCents: number, patch: Partial<CardTestSettings> = {}, expiry = "1230", extra: { cvv?: string; street?: string; zip?: string } = {}) =>
  evaluateTestCard({ number, expiry, amountCents, settings: settings(patch), ...extra }, NOW);

describe("Payflow test transaction rules", () => {
  it("accepts only the published test cards", () => {
    expect(card("4111 1111 1111 1111", 80100)).toMatchObject({ result: 0, approved: true, brand: "Visa", last4: "1111" });
    expect(card("4222222222222", 80100).result).toBe(0);
    expect(card("378282246310005", 80100).brand).toBe("American Express");
    expect(card("4000000000000002", 80100)).toMatchObject({ result: 23, approved: false, respmsg: "Invalid account number" });
  });

  it("needs a valid future expiry in MMYY", () => {
    expect(validExpiry("1230", NOW)).toBe(true);
    expect(validExpiry("1126", NOW)).toBe(true);
    expect(validExpiry("1026", NOW)).toBe(false);
    expect(validExpiry("0298", NOW)).toBe(false);
    expect(validExpiry("1330", NOW)).toBe(false);
    expect(card("4111111111111111", 80100, {}, "0120").result).toBe(24);
  });

  it("applies each processor's amount table", () => {
    const r = (processor: ProcessorId, dollars: number) => amountResult(Math.round(dollars * 100), processor);
    for (const p of ["amex", "elavon", "tsys", "vantiv"] as const) {
      expect(r(p, 1000)).toBe(0);
      expect(r(p, 1012)).toBe(12);
      expect(r(p, 1013)).toBe(13);
      expect(r(p, 1500)).toBe(12);
      expect(r(p, 2001)).toBe(12);
    }
    expect(r("elavon", 1104)).toBe(104);
    expect(r("elavon", 1005)).toBe(12); // 5 isn't available on Elavon
    expect(r("elavon", 2000)).toBe(12); // nor is 1000
    expect(r("amex", 2000)).toBe(1000);
    expect(r("vantiv", 1104)).toBe(12);
    expect(r("global-payments", 1030)).toBe(30);
    expect(r("global-payments", 1099)).toBe(99);
    expect(r("global-payments", 1114)).toBe(114);
    expect(r("paymentech-salem", 1050)).toBe(50);
    expect(r("paymentech-tampa", 1003)).toBe(3);
    expect(r("fiserv-north", 1023)).toBe(23);
    expect(r("tsys", 1114)).toBe(114);
    expect(r("tsys", 1013.5)).toBe(12);
  });

  it("applies the Payflow simulator amount table", () => {
    const r = (dollars: number) => amountResult(dollars * 100, "payflow-simulator");
    expect(r(10000)).toBe(0);
    expect(r(10402)).toBe(3);
    expect(r(10422)).toBe(13);
    expect(r(10504)).toBe(114);
    expect(r(10505)).toBe(112);
    expect(r(15002)).toBe(12);
    expect(r(12345)).toBe(1000);
  });

  it("maps CVV2 and AVS values", () => {
    expect([cvvMatch("000"), cvvMatch("123"), cvvMatch("456"), cvvMatch("700"), cvvMatch(undefined)]).toEqual(["Y", "Y", "N", "X", null]);
    expect(avsMatch("24285 Elm", "00382")).toEqual({ avsAddr: "Y", avsZip: "Y" });
    expect(avsMatch("49354 Main", "94303")).toEqual({ avsAddr: "N", avsZip: "N" });
    expect(avsMatch("79232 Maple", "20304")).toEqual({ avsAddr: "X", avsZip: "X" });
    expect(avsMatch("Elm Street", "00382")).toEqual({ avsAddr: "X", avsZip: "X" });
  });
  it("returns 25 for card types the store or processor can't take", () => {
    expect(card("30569309025904", 80100).result).toBe(0);
    expect(card("30569309025904", 80100, { acceptedTypes: ["visa", "mastercard"] }).result).toBe(25);
    expect(card("4999991111111113", 80100).result).toBe(25);
    expect(card("4999991111111113", 80100, { processor: "paymentech-salem" }).result).toBe(0);
  });

  it("can decline on CVV mismatch and enforce AVS Deny", () => {
    expect(card("4111111111111111", 80100, {}, "1230", { cvv: "456" })).toMatchObject({ result: 0, cvv2Match: "N" });
    expect(card("4111111111111111", 80100, { declineOnCvvMismatch: true }, "1230", { cvv: "456" })).toMatchObject({ result: 12, cvv2Match: null });
    expect(card("4111111111111111", 80100, { declineOnCvvMismatch: true }, "1230", { cvv: "123" }).result).toBe(0);
    expect(card("4111111111111111", 80100, { avsDeny: true }, "1230", { street: "49354 Main", zip: "00382" }).result).toBe(112);
    expect(card("4111111111111111", 80100, { avsDeny: true }, "1230", { street: "79232 Maple", zip: "20304" }).result).toBe(0);
  });

  it("simulates the Litle Account Updater", () => {
    expect(accountUpdate("4111111111111111", "0120", 85400)).toEqual({ card: "4321432143214321", expiry: "0150" });
    expect(accountUpdate("4111111111111111", "0120", 45000)).toEqual({ card: "4321432143214321", expiry: null });
    expect(accountUpdate("4111111111111111", "0120", 35000)).toEqual({ card: null, expiry: "0150" });
    expect(accountUpdate("4111111111111111", "0120", 25000)).toEqual({ card: null, expiry: null });

    const both = card("4111111111111111", 85400, { accountUpdater: true }, "0120");
    expect(both).toMatchObject({ result: 0, ccUpdated: true, updatedLast4: "4321", updatedExpiry: "0150", last4: "1111" });
    // Only the card number is refreshed at $450, so the old expiry still fails.
    expect(card("4111111111111111", 45000, { accountUpdater: true }, "0120")).toMatchObject({ result: 24, updatedLast4: "4321" });
    // 0000 → 0919 is still in the past.
    expect(card("4111111111111111", 35000, { accountUpdater: true }, "0000")).toMatchObject({ result: 24, updatedExpiry: "0919" });
    // The updater-only test card is accepted only with the updater on.
    expect(card("5560136761278244", 85400).result).toBe(23);
    expect(card("5560136761278244", 85400, { accountUpdater: true })).toMatchObject({ result: 0, updatedLast4: "5100" });
  });
});


describe("paying by test card in demo checkout", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("declines, lets the shopper retry, confirms, and never stores the card number", async () => {
    const { session } = await createSession("laptop for video editing under $1,800 with 32GB RAM");
    for await (const e of streamNegotiation(session.id)) void e;
    const s = (await store.getSession(session.id))!;
    const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await startPayment(order.id, "http://localhost:3000");

    const declined = await simulatorPayByCard(order.id, paypalOrderId, { number: "4000000000000002", expiry: "1230", settings: DEFAULT_CARD_SETTINGS });
    expect(declined.card.result).toBe(23);
    expect(declined.order.status).toBe("payment_pending");

    const paid = await simulatorPayByCard(order.id, paypalOrderId, {
      number: "4111111111111111",
      expiry: "1230",
      cvv: "456",
      street: "24285 Elm",
      zip: "00382",
      settings: DEFAULT_CARD_SETTINGS,
    });
    expect(paid.card).toMatchObject({ result: 0, cvv2Match: "N", avsAddr: "Y", avsZip: "Y" });
    expect(paid.order.status).toBe("confirmed");
    expect(paid.order.payment!.method).toBe("card");
    expect(paid.order.payment!.cardAttempts!.map((a) => a.result)).toEqual([23, 0]);
    const cvvCheck = paid.order.payment!.verification!.checks.find((c) => c.id === "card-cvv")!;
    expect(cvvCheck).toMatchObject({ status: "fail", essential: false });
    expect(paid.order.payment!.verification!.ok).toBe(true);

    const stored = JSON.stringify(await store.getOrder(order.id));
    expect(stored).not.toContain("4111111111111111");
    expect(stored).not.toContain("4000000000000002");
    expect(stored).not.toContain('"456"');
  });

  it("follows the selected processor's table for larger amounts", async () => {
    const { session } = await createSession("laptop for video editing under $1,800 with 32GB RAM");
    for await (const e of streamNegotiation(session.id)) void e;
    const s = (await store.getSession(session.id))!;
    const { order } = await lockDealAndPrepareOrder(s.id, s.result!.recommendedOfferId!);
    await approveOrder(order.id, { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion }, { stepUp: "passkey" });
    const { paypalOrderId } = await startPayment(order.id, "http://localhost:3000");
    const res = await simulatorPayByCard(order.id, paypalOrderId, { number: "5555555555554444", expiry: "1230", settings: { ...DEFAULT_CARD_SETTINGS, processor: "elavon" } });
    expect(res.card.result).toBe(amountResult(order.totalCents, "elavon"));
  });
});
