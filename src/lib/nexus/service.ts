import "server-only";
import { createHash } from "node:crypto";
import { STEP_UP_MIN_CENTS, stepUpRequired } from "./step-up";
import { negotiate } from "./agents/coordinator";
import { classifyFollowUp, explainRanking, understandIntent } from "./agents/llm";
import { summarizeIntent } from "./intent";
import { incentiveCostByLever, offerTotal, priceConcession } from "./agents/pricing";
import { getProduct } from "./catalog";
import { newId, nowIso } from "./ids";
import { MERCHANT_DIRECTORY, MERCHANT_IDS } from "./directory";
import { formatMoney } from "./money";
import { prepareOrder } from "./orders";
import { PaymentError, type WebhookEvent } from "./payments/gateway";
import { configuredPayee, getGateway, paypalConfigured, simulatedGateway, webhookRequired } from "./payments";
import { verifyPayment } from "./payments/verify";
import { hashTerms, signAgreement, verifyAgreementSignature } from "./signing";
import { store } from "./store";
import { assessRisk, CARD_TESTING_LIMIT, VELOCITY_WINDOW_MS } from "./security/fraud";
import { screenPrompt, screenUntrusted, SHIELD_REPLY } from "./security/prompt-shield";
import { appendRecord, readLedger } from "./security/ledger";
import { APPROVAL_TTL_MS, signApproval, verifyApproval, webhookFresh } from "./security/payment-guard";
import { inspectOffer, isRestricted, recentTrustEvents, recordTrustEvent, trustReport } from "./security/trust";
import { evaluateTestCard, type CardTestInput, type CardTestResult } from "./payments/test-cards";
import type {
  Agreement,
  CardAttempt,
  ChatMessage,
  CommerceSession,
  MerchantId,
  MerchantProfile,
  NegotiationEvent,
  NexusOrder,
  PaymentState,
  TimelineEntry,
  WebhookRecord,
  SecurityEvent,
} from "./types";
import { verifyDeal } from "./verification";

export class NexusError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type ChatAction = { type: "none" } | { type: "negotiate" } | { type: "order"; orderId: string };

function chat(role: ChatMessage["role"], text: string, via: ChatMessage["via"] = "chat"): ChatMessage {
  return { id: newId("chat"), role, text, createdAt: nowIso(), via };
}

const ASK_CATEGORY =
  "Happy to help. What are you shopping for? I can negotiate laptops, smartphones, monitors, headphones and tablets — tell me the budget and anything that matters (specs, warranty, delivery).";

async function securityEvent(kind: SecurityEvent["kind"], severity: SecurityEvent["severity"], title: string, detail: string, ref: string | null) {
  await store.addSecurityEvent({ id: newId("sec"), at: nowIso(), kind, severity, title, detail, ref });
}

const deviceHash = (id: string | null | undefined) => (id ? createHash("sha256").update(`device|${id}`).digest("hex").slice(0, 16) : null);

/** Everything the fraud model needs about this payment, from stored records only. Never from the browser. */
async function riskContextFor(order: NexusOrder, deviceId: string | null) {
  const [orders, sessions] = await Promise.all([store.listOrders(500), store.listSessions(1000)]);
  const now = Date.now();
  const since = now - VELOCITY_WINDOW_MS;
  const session = sessions.find((s) => s.id === order.sessionId) ?? (await store.getSession(order.sessionId));
  const device = deviceId ?? order.deviceId ?? session?.deviceId ?? null;
  const merchantOrders = orders.filter((o) => o.merchantId === order.merchantId && o.payment?.capturedAt);
  const troubled = merchantOrders.filter((o) => o.status === "refunded" || o.status === "disputed").length;
  const dHash = deviceHash(device);
  const deviceBlocks = dHash
    ? readLedger<{ deviceHash: string | null; decision: string }>("risk-decision", 2000).filter(
        (r) => r.data.deviceHash === dHash && r.data.decision === "block" && Date.parse(r.at) >= now - 24 * 3600_000,
      ).length
    : 0;
  return {
    totalCents: order.totalCents,
    quantity: order.terms.quantity,
    budgetCents: session?.intent?.budgetCents ?? null,
    recentPaymentStarts: orders.filter((o) => o.id !== order.id && o.payment?.createdAt && Date.parse(o.payment.createdAt) >= since).length,
    history: orders.filter((o) => o.id !== order.id && o.status === "confirmed").map((o) => o.payment?.capturedAmountCents ?? o.totalCents),
    recentDeclines: orders.flatMap((o) => o.payment?.cardAttempts ?? []).filter((a) => !a.approved && Date.parse(a.at) >= since).length,
    forgedWebhooks: order.payment?.webhooks.filter((w) => !w.signatureVerified).length ?? 0,
    approvalToPayMs: order.approval && !order.payment ? now - Date.parse(order.approval.approvedAt) : null,
    paymentAttempts: (order.paymentAttempts ?? 0) + 1,
    devicePaymentStarts: device
      ? orders.filter((o) => o.id !== order.id && o.deviceId === device && o.payment?.createdAt && Date.parse(o.payment.createdAt) >= since).length
      : 0,
    deviceSessions: device ? sessions.filter((s) => s.deviceId === device && Date.parse(s.createdAt) >= now - 3600_000).length : 0,
    deviceBlocks,
    deviceMissing: !device,
    merchantTrust: trustReport(order.merchantId).score,
    merchantDisputeRate: merchantOrders.length >= 5 ? troubled / merchantOrders.length : null,
    deviceHash: dHash,
  };
}

/** Deterministic payment validation: the signed approval must still match the order. No AI or client input can skip this. */
async function enforceApproval(order: NexusOrder, stage: "payment" | "capture"): Promise<void> {
  const check = verifyApproval(order);
  if (check.ok) return;
  await store.updateOrder(order.id, (o) => {
    if (o.status === "approved" || (o.status === "payment_pending" && stage === "payment")) {
      o.status = "awaiting_approval";
      o.approval = null;
      o.riskConfirmedAt = null;
    }
    o.timeline.push(timeline(check.kind === "expired" ? "Approval expired" : "Approval rejected", check.reason ?? "", check.kind === "expired" ? "info" : "error"));
  });
  if (check.kind === "tampered") {
    await securityEvent("approval-tampered", "high", "Rejected a modified approval", `${check.reason} (${stage})`, order.id);
  }
  throw new NexusError(check.reason ?? "Approval is not valid", 409);
}

async function requireSession(id: string): Promise<CommerceSession> {
  const s = await store.getSession(id);
  if (!s) throw new NexusError("Session not found", 404);
  return s;
}

export async function getOrder(id: string): Promise<NexusOrder> {
  return requireOrder(id);
}

async function requireOrder(id: string): Promise<NexusOrder> {
  const o = await store.getOrder(id);
  if (!o) throw new NexusError("Order not found", 404);
  return o;
}

/** Merchant profiles with their live (store) policy and remaining budget. */
export async function liveMerchants(): Promise<Record<MerchantId, MerchantProfile>> {
  const out = {} as Record<MerchantId, MerchantProfile>;
  for (const id of MERCHANT_IDS) {
    const policy = { ...(await store.getPolicy(id)), remaining: await store.remainingBudget(id) };
    // Server-side trust enforcement: a restricted store agent is paused, whatever it claims about itself.
    if (isRestricted(id)) policy.active = false;
    out[id] = { ...MERCHANT_DIRECTORY[id], policy };
  }
  return out;
}

export interface SessionOptions {
  /** Spending limit set in the command bar; overrides any amount in the text. */
  budgetCents?: number | null;
  /** Anonymous browser device ID (fraud signal only). */
  deviceId?: string | null;
}

// ---------------------------------------------------------------- sessions

export async function createSession(text: string, via: ChatMessage["via"] = "chat", options: SessionOptions = {}) {
  const now = nowIso();
  const session: CommerceSession = {
    id: newId("ses"),
    createdAt: now,
    updatedAt: now,
    status: "intake",
    intent: null,
    chat: [],
    messages: [],
    offers: [],
    counters: [],
    result: null,
    agreement: null,
    orderId: null,
    negotiationRun: 0,
    agreementCount: 0,
    deviceId: options.deviceId ?? null,
  };
  await store.saveSession(session);
  return postChat(session.id, text, via, options);
}

export async function postChat(
  sessionId: string,
  text: string,
  via: ChatMessage["via"] = "chat",
  options: SessionOptions = {},
): Promise<{ session: CommerceSession; action: ChatAction }> {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) throw new NexusError("Message is empty");
  let session = await store.updateSession(sessionId, (s) => {
    s.chat.push(chat("user", trimmed, via));
  });

  const reply = async (text: string, action: ChatAction = { type: "none" }) => {
    session = await store.updateSession(sessionId, (s) => {
      s.chat.push(chat("buyer", text, via));
    });
    return { session, action };
  };

  // AI firewall: screen the message before any agent or model sees it.
  const lockedSince = Date.now() - 24 * 3600_000;
  if (recentTrustEvents("buyer", ["repeated-manipulation"], lockedSince, sessionId) > 0) {
    throw new NexusError("This conversation is locked after repeated manipulation attempts. Start a new request.", 423);
  }
  const shield = screenPrompt(trimmed);
  if (shield.verdict !== "safe") {
    recordTrustEvent("buyer", "manipulation-attempt", `${shield.signals.map((x) => x.label).join("; ")} (score ${shield.score})`, sessionId);
    if (shield.verdict === "blocked" && recentTrustEvents("buyer", ["manipulation-attempt"], lockedSince, sessionId) >= 3) {
      recordTrustEvent("buyer", "repeated-manipulation", "Three or more manipulation attempts in one conversation; conversation locked.", sessionId);
      await securityEvent("prompt-injection", "high", "Locked a conversation after repeated attacks", "Three or more blocked messages in one conversation.", sessionId);
    }
    await securityEvent(
      "prompt-injection",
      shield.verdict === "blocked" ? "high" : "low",
      shield.verdict === "blocked" ? "Blocked a prompt-injection attempt" : "Flagged a suspicious message",
      `${shield.signals.map((x) => x.label).join("; ")} (score ${shield.score}).`,
      sessionId,
    );
    if (shield.verdict === "blocked") return reply(SHIELD_REPLY);
  }

  if (session.status === "negotiating") {
    return reply("I'm mid-negotiation with the merchants — give me a few seconds and I'll report back with the ranked offers.");
  }

  if (session.status === "ordered" && session.orderId) {
    const order = await store.getOrder(session.orderId);
    if (order && !["awaiting_approval", "approved", "payment_pending"].includes(order.status)) {
      return reply(`Your order with ${MERCHANT_DIRECTORY[order.merchantId].name} is ${order.status.replace(/_/g, " ")}. Start a new conversation to shop for something else.`);
    }
  }

  // Intake, or a refinement / decision after offers are in.
  if (!session.intent || session.status === "intake") {
    return startFromIntent(sessionId, trimmed, reply, false, options);
  }

  const follow = await classifyFollowUp(trimmed, session);
  if (follow.action === "choose") {
    const ranking = session.result?.ranking ?? [];
    const pick = follow.merchantId === "recommended" ? ranking[0] : ranking.find((r) => r.merchantId === follow.merchantId);
    if (!pick) return reply(`${follow.merchantId === "recommended" ? "There's no recommended offer" : `${MERCHANT_DIRECTORY[follow.merchantId as MerchantId].name} didn't make a final offer`} — want me to negotiate again?`);
    try {
      const { order, agreement } = await lockDealAndPrepareOrder(sessionId, pick.offerId);
      const essential = agreement.verification.checks.filter((c) => c.essential);
      return reply(
        `Locked with ${MERCHANT_DIRECTORY[pick.merchantId].name}. All ${essential.length} important safety checks passed. Your order for ${formatMoney(order.totalCents)} is ready: review it and approve when you’re ready. Nothing is charged until you approve and pay with PayPal.`,
        { type: "order", orderId: order.id },
      );
    } catch (err) {
      return reply(err instanceof Error ? err.message : "I couldn't lock that deal.");
    }
  }
  if (follow.action === "explain") return reply(explainRanking(session));
  if (follow.action === "help") {
    return reply('You can say "go with Vantage", "lock the recommended deal", ask "why Maison Aurum?", or change the brief, e.g. "budget $1,400, prefer longer warranty".');
  }
  return startFromIntent(sessionId, trimmed, reply, true, options);
}

async function startFromIntent(
  sessionId: string,
  text: string,
  reply: (t: string, a?: ChatAction) => Promise<{ session: CommerceSession; action: ChatAction }>,
  refining = false,
  options: SessionOptions = {},
) {
  const current = await requireSession(sessionId);
  const parsed = await understandIntent(text, current.intent);
  if (!parsed.intent) return reply(ASK_CATEGORY);
  if (options.budgetCents) {
    parsed.intent.budgetCents = options.budgetCents;
    parsed.intent.summary = summarizeIntent(parsed.intent);
  }
  await releaseOpenDeal(current);
  await store.updateSession(sessionId, (s) => {
    s.intent = parsed.intent;
    s.status = "intake";
    s.agreement = null;
    s.orderId = null;
  });
  const i = parsed.intent;
  const budgetNote = i.budgetCents ? ` I’ll keep your ${formatMoney(i.budgetCents)} budget secret from the stores.` : "";
  const askNote = i.askDiscountPct
    ? ` I’ll ask for ${Math.round(i.askDiscountPct * 100)}% off. Each store meets you halfway between its opening price and your ask, within its own limits.`
    : "";
  return reply(
    `${refining ? "Updated" : "Got it"}! Looking for: ${i.summary}.${budgetNote} Asking Maison Aurum, Vantage Market and Cove Commerce for their best price now.${askNote}`,
    { type: "negotiate" },
  );
}

/**
 * If a deal was locked but not paid, cancel its order and release the stock
 * and merchant budget it reserved. A failed verification reserved nothing.
 */
async function releaseOpenDeal(session: CommerceSession) {
  if (!session.agreement || !session.orderId) return;
  const order = await store.getOrder(session.orderId);
  if (!order || order.status === "cancelled") return;
  if (!["awaiting_approval", "approved", "payment_pending"].includes(order.status)) {
    throw new NexusError("This deal has already been paid for. Start a new conversation to buy something else.", 409);
  }
  await store.updateOrder(order.id, (o) => {
    o.status = "cancelled";
    o.timeline.push(timeline("Order cancelled", "Customer re-opened negotiation; previous approval no longer valid", "info"));
  });
  await store.releaseStock(order.terms.listingId, order.terms.quantity);
  const reserve = (await store.ledger(order.merchantId)).find((e) => e.orderId === order.id && e.type === "reserve");
  if (reserve) {
    await store.appendLedger({ ...reserve, id: newId("led"), type: "release", at: nowIso(), note: `Released: order ${order.id} cancelled` });
  }
}

export async function* streamNegotiation(sessionId: string, signal?: AbortSignal): AsyncGenerator<NegotiationEvent> {
  const start = await requireSession(sessionId);
  if (!start.intent) throw new NexusError("Tell the buyer agent what you want first");
  if (start.status === "ordered") throw new NexusError("This session already has an order", 409);

  const run = start.negotiationRun + 1;
  await store.updateSession(sessionId, (s) => {
    s.negotiationRun = run;
    s.status = "negotiating";
    s.messages = [];
    s.offers = [];
    s.counters = [];
    s.result = null;
    s.agreement = null;
  });

  const listings = await store.listListings();
  const pace = Number(process.env.NEXUS_PACE_MS ?? 380);
  let stale = false;
  try {
    const merchants = await liveMerchants();
    for await (const event of negotiate(start.intent, listings, { paceMs: pace, signal, merchants })) {
      const updated = await store.updateSession(sessionId, (s) => {
        if (s.negotiationRun !== run) {
          stale = true;
          return;
        }
        switch (event.type) {
          case "message":
            s.messages.push(event.message);
            break;
          case "offer":
            s.offers.push(event.offer);
            break;
          case "counter":
            s.counters.push(event.counter);
            break;
          case "result":
            s.result = event.result;
            s.status = "negotiated";
            s.chat.push(chat("buyer", `${event.result.recommendation} Press "Choose this deal" on the one you want, or tell me what to change.`));
            break;
        }
      });
      if (stale || updated.negotiationRun !== run) return;
      if (event.type === "offer" && event.offer.terms) {
        // Every store-agent offer is checked against its registered listing.
        const listing = listings.find((l) => l.id === event.offer.terms!.listingId) ?? null;
        for (const f of inspectOffer(event.offer, listing)) recordTrustEvent(event.offer.merchantId, f.kind, f.detail, sessionId);
        const hidden = screenUntrusted(event.offer.message);
        if (hidden.verdict === "blocked") {
          recordTrustEvent(event.offer.merchantId, "indirect-injection", hidden.signals.map((x) => x.label).join("; "), sessionId);
          await securityEvent("indirect-injection", "high", "Store agent message carried hidden instructions", hidden.signals.map((x) => x.label).join("; "), sessionId);
        }
      }
      yield event;
    }
  } catch (err) {
    await store.updateSession(sessionId, (s) => {
      if (s.negotiationRun === run) s.status = "failed";
    });
    yield { type: "error", error: err instanceof Error ? err.message : "Negotiation failed" };
    return;
  }
  if (signal?.aborted) {
    await store.updateSession(sessionId, (s) => {
      if (s.negotiationRun === run && s.status === "negotiating") s.status = "intake";
    });
  }
}

// ---------------------------------------------------------------- agreement & order

export async function lockDealAndPrepareOrder(sessionId: string, offerId: string): Promise<{ session: CommerceSession; agreement: Agreement; order: NexusOrder }> {
  const session = await requireSession(sessionId);
  if (session.status === "negotiating") throw new NexusError("Negotiation still running", 409);
  if (!session.intent || !session.result) throw new NexusError("No completed negotiation to lock", 409);
  if (session.agreement && session.orderId) {
    const existing = await store.getOrder(session.orderId);
    if (existing && existing.status !== "cancelled") {
      if (session.agreement.offerId === offerId) return { session, agreement: session.agreement, order: existing };
      await releaseOpenDeal(session);
    }
  }

  const offer = session.offers.find((o) => o.id === offerId);
  if (!offer?.terms) throw new NexusError("Unknown offer", 404);
  // Only the merchant's latest offer is binding.
  const latestFromMerchant = [...session.offers].reverse().find((o) => o.merchantId === offer.merchantId);
  const terms = offer.terms;
  const termsHash = hashTerms(terms);
  const signature = signAgreement(sessionId, offerId, termsHash);
  const listing = await store.getListing(terms.listingId);
  const merchant = (await liveMerchants())[offer.merchantId];
  const version = (session.agreementCount ?? 0) + 1;

  const verification = verifyDeal({
    sessionId,
    offerId,
    terms,
    totalCents: offerTotal(terms),
    termsHash,
    signature,
    recordedOffer: latestFromMerchant?.id === offerId ? latestFromMerchant : undefined,
    intent: session.intent,
    listing: listing ?? undefined,
    merchant,
    payeeConfigured: Boolean(configuredPayee(offer.merchantId)),
    paymentMode: getGateway().provider,
    hashTerms,
    verifySignature: verifyAgreementSignature,
  });

  const agreement: Agreement = {
    id: newId("agr"),
    sessionId,
    offerId,
    merchantId: offer.merchantId,
    terms,
    totalCents: offerTotal(terms),
    agreedAt: nowIso(),
    version,
    termsHash,
    signature,
    verification,
  };

  if (!verification.ok) {
    const blocking = verification.checks.filter((c) => c.essential && c.status !== "pass").map((c) => `${c.label.toLowerCase()} (${c.status})`);
    await store.updateSession(sessionId, (s) => {
      s.agreement = agreement;
      s.agreementCount = version;
    });
    throw new NexusError(`Deal verification failed: ${blocking.join(", ")}. I won't prepare an order on these terms.`, 422);
  }
  if (!(await store.reserveStock(terms.listingId, terms.quantity))) {
    throw new NexusError("That item just sold out at this merchant.", 409);
  }

  const order = prepareOrder(agreement, listing!);
  await store.saveOrder(order);
  // Owner listings (property, rentals, cars) don't draw on the store's promo budget.
  if (!listing!.sellerListing) await store.appendLedger({
    id: newId("led"),
    merchantId: offer.merchantId,
    at: nowIso(),
    type: "reserve",
    sessionId,
    orderId: order.id,
    concessionCents: priceConcession(terms),
    incentiveCents: incentiveCostByLever(merchant, listing!, terms),
    note: `Reserved for agreement v${version} (${getProduct(terms.productId).name})`,
  });
  const updated = await store.updateSession(sessionId, (s) => {
    s.agreement = agreement;
    s.agreementCount = version;
    s.status = "ordered";
    s.orderId = order.id;
    s.messages.push({
      id: newId("msg"),
      round: offer.round,
      from: "coordinator",
      to: offer.merchantId,
      kind: "accept",
      text: `Agreement v${version} signed with ${MERCHANT_DIRECTORY[offer.merchantId].name}: ${getProduct(terms.productId).name}, ${formatMoney(agreement.totalCents)}. Terms hash ${termsHash.slice(0, 12)}…`,
      offerId,
      createdAt: nowIso(),
    });
  });
  return { session: updated, agreement, order };
}

function timeline(label: string, detail: string, status: TimelineEntry["status"] = "done"): TimelineEntry {
  return { at: nowIso(), label, detail, status };
}

function lifecycle(o: NexusOrder, state: PaymentState, detail: string) {
  o.payment?.lifecycle.push({ state, at: nowIso(), detail });
}

/**
 * The customer approves the exact order. Approvals of $1,000 or more also need
 * the customer's passkey, verified by the API route before it calls this
 * (`stepUp: "passkey"`); without it they are refused here.
 */
export async function approveOrder(orderId: string, body: { termsHash: string; amountCents: number; agreementVersion: number }, opts: { stepUp?: "passkey" } = {}): Promise<NexusOrder> {
  const order = await requireOrder(orderId);
  if (order.status !== "awaiting_approval") {
    if (order.status === "approved" && order.approval?.termsHash === body.termsHash) return order;
    throw new NexusError(`Order is ${order.status.replace(/_/g, " ")}`, 409);
  }
  // The customer approves the exact amount, terms and agreement version they
  // were shown. Any material change produces a new version and hash.
  const session = await store.getSession(order.sessionId);
  const currentVersion = session?.agreement?.version;
  if (
    body.termsHash !== order.termsHash ||
    body.amountCents !== order.totalCents ||
    body.agreementVersion !== order.agreementVersion ||
    currentVersion !== order.agreementVersion
  ) {
    throw new NexusError("Approval doesn't match the order's current terms. Refresh and review again.", 409);
  }
  if (new Date(order.terms.expiresAt).getTime() < Date.now()) {
    throw new NexusError("The merchant's offer has expired. Re-negotiate to get fresh terms.", 409);
  }
  if (stepUpRequired(order) && opts.stepUp !== "passkey") {
    throw new NexusError(`Approvals of ${formatMoney(STEP_UP_MIN_CENTS)} or more need your passkey. Confirm it's you and try again.`, 403);
  }
  return store.updateOrder(orderId, (o) => {
    o.status = "approved";
    const approvedAt = nowIso();
    const unsigned = {
      approvedAt,
      termsHash: body.termsHash,
      amountCents: body.amountCents,
      agreementVersion: body.agreementVersion,
      merchantId: o.merchantId,
      currency: o.currency,
      expiresAt: new Date(Date.parse(approvedAt) + APPROVAL_TTL_MS).toISOString(),
    };
    o.approval = { ...unsigned, signature: signApproval(o.id, unsigned) };
    o.timeline.push(
      timeline("Customer approved", `Approved ${formatMoney(body.amountCents)} for exact terms ${body.termsHash.slice(0, 10)}…${opts.stepUp === "passkey" ? " · confirmed with passkey" : ""}`),
    );
  });
}

export async function startPayment(
  orderId: string,
  origin: string,
  opts: { confirmRisk?: boolean; deviceId?: string | null } = {},
): Promise<{ order: NexusOrder; paypalOrderId: string }> {
  let order = await requireOrder(orderId);
  if (order.status !== "approved" && order.status !== "payment_pending") {
    throw new NexusError(order.status === "awaiting_approval" ? "Approve the order before paying" : `Order is ${order.status.replace(/_/g, " ")}`, 409);
  }

  await enforceApproval(order, "payment");

  // Fraud check before any money moves.
  const { deviceHash: dHash, ...ctx } = await riskContextFor(order, opts.deviceId ?? null);
  const risk = assessRisk(ctx);
  const reasons = risk.signals.map((x) => x.label).join("; ");
  const confirmed = Boolean(order.riskConfirmedAt) || Boolean(opts.confirmRisk);
  appendRecord("risk-decision", {
    orderId,
    merchantId: order.merchantId,
    totalCents: order.totalCents,
    score: risk.score,
    level: risk.level,
    decision: risk.decision,
    signals: risk.signals,
    deviceHash: dHash,
    confirmed: risk.decision === "confirm" && confirmed,
  });
  order = await store.updateOrder(orderId, (o) => {
    o.paymentAttempts = (o.paymentAttempts ?? 0) + 1;
    if (opts.deviceId && !o.deviceId) o.deviceId = opts.deviceId;
    const first = !o.risk || o.risk.decision !== risk.decision;
    o.risk = risk;
    if (risk.decision === "confirm" && opts.confirmRisk && !o.riskConfirmedAt) {
      o.riskConfirmedAt = nowIso();
      o.timeline.push(timeline("Payment confirmed by shopper", `Fraud score ${risk.score}: ${reasons}`));
    } else if (first) {
      o.timeline.push(
        risk.decision === "allow"
          ? timeline("Fraud check passed", `Score ${risk.score}/100${reasons ? `: ${reasons}` : ""}`)
          : timeline(risk.decision === "block" ? "Payment blocked" : "Payment needs confirmation", `Fraud score ${risk.score}/100: ${reasons}`, risk.decision === "block" ? "error" : "info"),
      );
    }
  });
  if (risk.decision === "block") {
    await securityEvent("fraud-block", "high", "Blocked a risky payment", `${formatMoney(order.totalCents)}, score ${risk.score}: ${reasons}`, orderId);
    throw new NexusError(`This payment was blocked by our fraud check (${reasons}). Nothing was charged.`, 403);
  }
  if (risk.decision === "confirm" && !confirmed) {
    await securityEvent("fraud-confirm", "medium", "Asked the shopper to confirm a payment", `${formatMoney(order.totalCents)}, score ${risk.score}: ${reasons}`, orderId);
    throw new NexusError(`Please confirm this payment is yours: ${reasons}.`, 428);
  }
  // A second payment start while one is open reuses it instead of creating a duplicate PayPal order.
  const open = order.payment;
  if (order.status === "payment_pending" && open?.status === "CREATED" && Date.now() - Date.parse(open.createdAt) < APPROVAL_TTL_MS) {
    return { order, paypalOrderId: open.paypalOrderId };
  }
  const gateway = getGateway();
  const product = getProduct(order.terms.productId);
  try {
    const created = await gateway.createOrder({
      order,
      merchantName: MERCHANT_DIRECTORY[order.merchantId].name,
      productName: product.name,
      payee: configuredPayee(order.merchantId),
      returnUrl: `${origin}/orders/${order.id}?paypal=return`,
      cancelUrl: `${origin}/orders/${order.id}?paypal=cancel`,
    });
    const updated = await store.updateOrder(orderId, (o) => {
      o.status = "payment_pending";
      o.payment = {
        provider: gateway.provider,
        paypalOrderId: created.id,
        status: "CREATED",
        createdAt: nowIso(),
        expectedPayee: configuredPayee(o.merchantId) ?? created.payee,
        captureId: null,
        capturedAt: null,
        capturedAmountCents: null,
        capturedCurrency: null,
        verification: null,
        webhooks: [],
        lifecycle: [],
      };
      lifecycle(o, "created", `${gateway.provider === "simulated" ? "Simulator" : "PayPal Sandbox"} order ${created.id}`);
      lifecycle(o, "awaiting_approval", "Waiting for the buyer to approve on PayPal");
      o.timeline.push(timeline("PayPal order created", `${gateway.provider === "simulated" ? "Simulator" : "Sandbox"} order ${created.id} for ${formatMoney(o.totalCents)}`));
    });
    return { order: updated, paypalOrderId: created.id };
  } catch (err) {
    if (err instanceof PaymentError) throw new NexusError(err.message, err.status);
    throw err;
  }
}

/** Simulator only: stands in for the buyer approving on PayPal. */
export async function simulatorApprove(orderId: string, paypalOrderId: string): Promise<NexusOrder> {
  if (paypalConfigured()) throw new NexusError("Simulator is disabled when PayPal sandbox is configured", 403);
  const order = await requireOrder(orderId);
  if (order.payment?.paypalOrderId !== paypalOrderId) throw new NexusError("PayPal order doesn't belong to this order", 409);
  await simulatedGateway.approve(paypalOrderId);
  return store.updateOrder(orderId, (o) => {
    o.payment!.status = "APPROVED";
    lifecycle(o, "approved", "Simulated buyer approval");
    o.timeline.push(timeline("Buyer approved on PayPal", "Simulated buyer approval (no funds move in simulator mode)"));
  });
}

export async function capturePayment(orderId: string, paypalOrderId: string): Promise<NexusOrder> {
  const order = await requireOrder(orderId);
  if (!order.payment || order.payment.paypalOrderId !== paypalOrderId) throw new NexusError("PayPal order doesn't belong to this order", 409);
  if (order.status === "confirmed" || order.status === "payment_captured") return order;
  if (order.status !== "payment_pending") throw new NexusError(`Order is ${order.status.replace(/_/g, " ")}`, 409);
  await enforceApproval(order, "capture");

  const gateway = getGateway();
  // Claim the capture atomically: a second, concurrent capture is refused, never executed twice.
  let claimed = false;
  await store.updateOrder(orderId, (o) => {
    const lock = o.payment!.captureLockAt;
    if (lock && Date.now() - Date.parse(lock) < 2 * 60_000) return;
    claimed = true;
    o.payment!.captureLockAt = nowIso();
    if (o.payment!.status === "CREATED") lifecycle(o, "approved", "Buyer approved on PayPal");
    lifecycle(o, "capturing", "Server requested capture");
  });
  if (!claimed) {
    await securityEvent("duplicate-payment", "medium", "Stopped a duplicate capture", "A second capture arrived while the first was still running.", orderId);
    throw new NexusError("This payment is already being captured.", 409);
  }
  let view;
  try {
    await gateway.captureOrder(paypalOrderId, `capture-${order.id}`);
    // Authoritative re-read: never trust the client or the capture response alone.
    view = await gateway.getOrder(paypalOrderId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Capture failed";
    await store.updateOrder(orderId, (o) => {
      o.payment!.captureLockAt = null;
      lifecycle(o, "failed", message);
      o.timeline.push(timeline("Capture failed", message, "error"));
    });
    throw new NexusError(message, err instanceof PaymentError ? err.status : 502);
  }

  let updated = await store.updateOrder(orderId, (o) => {
    const p = o.payment!;
    p.status = view.captureStatus === "COMPLETED" ? "COMPLETED" : "FAILED";
    p.captureId = view.captureId;
    p.capturedAt = nowIso();
    p.capturedAmountCents = view.amountCents;
    p.capturedCurrency = view.currency;
    lifecycle(o, view.captureStatus === "COMPLETED" ? "captured" : "failed", `Capture ${view.captureId ?? "—"} is ${view.captureStatus ?? "missing"}`);
    o.timeline.push(timeline("Payment captured", `Capture ${view.captureId ?? "—"} · ${view.amountCents !== null ? formatMoney(view.amountCents) : "no amount"}`));
  });
  updated = await reconcile(orderId, view);

  // The simulator delivers its signed webhook immediately, through the same
  // verification path a real PayPal webhook takes.
  if (gateway.provider === "simulated") {
    const hook = simulatedGateway.buildWebhook(view);
    await processWebhook(hook.headers, hook.body);
    updated = (await store.getOrder(orderId))!;
  }
  return updated;
}

/** Re-run payment verification and move the order to its resulting state. */
async function reconcile(orderId: string, view?: Awaited<ReturnType<ReturnType<typeof getGateway>["getOrder"]>>): Promise<NexusOrder> {
  const order = await requireOrder(orderId);
  if (!order.payment) return order;
  const v = view ?? (await getGateway().getOrder(order.payment.paypalOrderId));
  const report = verifyPayment(order, v, { webhookRequired: webhookRequired() });
  const failed = report.checks.filter((c) => c.essential && c.status === "fail");
  const pending = report.checks.some((c) => c.essential && c.status === "unknown");
  const updated = await store.updateOrder(orderId, (o) => {
    o.payment!.verification = report;
    // Refunds and disputes are later states; verification never overrides them.
    if (o.status === "refunded" || o.status === "disputed") return;
    const before = o.status;
    if (failed.length) o.status = "payment_failed";
    else if (pending) o.status = "payment_captured";
    else o.status = "confirmed";
    if (before !== o.status) {
      if (o.status === "confirmed") o.timeline.push(timeline("Order confirmed", `All ${report.checks.filter((c) => c.essential).length} essential payment checks passed`));
      else if (o.status === "payment_failed") o.timeline.push(timeline("Payment verification failed", failed.map((c) => c.label).join(", "), "error"));
      else o.timeline.push(timeline("Awaiting webhook", "Capture verified; waiting for signed PAYMENT.CAPTURE.COMPLETED", "info"));
    }
  });
  if (updated.status === "confirmed" && order.status !== "confirmed") {
    const reserve = (await store.ledger(updated.merchantId)).find((e) => e.orderId === updated.id && e.type === "reserve");
    if (reserve) await store.appendLedger({ ...reserve, id: newId("led"), type: "commit", at: nowIso(), note: `Committed: order ${updated.id} paid` });
  }
  return updated;
}

function captureIdFromEvent(event: WebhookEvent): string | null {
  const disputed = event.resource?.disputed_transactions?.find((d) => d.seller_transaction_id)?.seller_transaction_id;
  if (disputed) return disputed;
  const up = event.resource?.links?.find((l) => /\/captures\//.test(l.href))?.href;
  return up ? (/\/captures\/([A-Z0-9]+)/.exec(up)?.[1] ?? null) : null;
}

export async function processWebhook(headers: Headers, rawBody: string): Promise<{ status: number; detail: string }> {
  const gateway = getGateway();
  const result = await gateway.verifyWebhook(headers, rawBody);
  const event = result.event;
  if (!event) return { status: 400, detail: result.reason };

  const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  const captureId = captureIdFromEvent(event);
  const order =
    (paypalOrderId ? await store.findOrderByPayPalId(paypalOrderId) : null) ??
    (event.resource?.custom_id ? await store.getOrder(event.resource.custom_id) : null) ??
    (captureId ? await store.findOrderByCaptureId(captureId) : null);

  const record: WebhookRecord = {
    eventId: event.id,
    eventType: event.event_type,
    receivedAt: nowIso(),
    signatureVerified: result.verified,
    detail: result.reason,
  };

  if (!result.verified) {
    await securityEvent("webhook-forgery", "high", "Rejected a fake PayPal message", `${event.event_type}: ${result.reason}`, order?.id ?? null);
    if (order) {
      await store.updateOrder(order.id, (o) => {
        o.payment?.webhooks.push(record);
        o.timeline.push(timeline("Webhook rejected", `${event.event_type}: ${result.reason}`, "error"));
      });
    }
    return { status: 401, detail: result.reason };
  }
  // Replay defence: a validly signed message must be recent and never seen before.
  if (!webhookFresh(headers.get("paypal-transmission-time"))) {
    await securityEvent("webhook-replay", "high", "Rejected a stale PayPal message", `${event.event_type}: transmission time outside the 10-minute window.`, order?.id ?? null);
    return { status: 400, detail: "Stale webhook rejected" };
  }
  const transmission = headers.get("paypal-transmission-id");
  if (transmission && !(await store.markWebhookEvent(`tx:${transmission}`))) {
    await securityEvent("webhook-replay", "high", "Rejected a replayed PayPal message", `${event.event_type}: transmission ${transmission.slice(0, 8)}… was already processed.`, order?.id ?? null);
    return { status: 409, detail: "Replayed webhook rejected" };
  }
  if (!(await store.markWebhookEvent(event.id))) return { status: 200, detail: "Duplicate event ignored" };
  if (!order?.payment) return { status: 200, detail: "No matching Nexus order" };

  await store.updateOrder(order.id, (o) => {
    o.payment!.webhooks.push(record);
    o.timeline.push(timeline("Webhook verified", `${event.event_type} · ${event.id}`));
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.DENIED":
        o.status = "payment_failed";
        o.payment!.status = "DECLINED";
        lifecycle(o, "failed", "PayPal denied the capture");
        break;
      case "PAYMENT.CAPTURE.REFUNDED":
        o.status = "refunded";
        o.payment!.status = "REFUNDED";
        lifecycle(o, "refunded", `Refund ${event.resource?.id ?? ""} confirmed by signed webhook`.trim());
        o.timeline.push(timeline("Payment refunded", event.resource?.amount ? `${event.resource.amount.value} ${event.resource.amount.currency_code}` : "Refund recorded", "info"));
        break;
      case "CUSTOMER.DISPUTE.CREATED":
        o.status = "disputed";
        o.payment!.status = "DISPUTED";
        lifecycle(o, "disputed", `Dispute ${event.resource?.dispute_id ?? event.resource?.id ?? ""} opened`.trim());
        o.timeline.push(timeline("Dispute opened", "Buyer opened a dispute with PayPal", "error"));
        break;
    }
  });
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") await reconcile(order.id);
  return { status: 200, detail: "Processed" };
}

/**
 * Simulator only: pay with one of PayPal's published test cards, following
 * the Payflow test-transaction rules (amount-driven RESULT, CVV2MATCH, AVS).
 * A decline leaves the order open for another attempt.
 */
export async function simulatorPayByCard(
  orderId: string,
  paypalOrderId: string,
  card: Omit<CardTestInput, "amountCents">,
): Promise<{ order: NexusOrder; card: CardTestResult }> {
  if (paypalConfigured()) throw new NexusError("Test cards are only for demo mode. With PayPal Sandbox, use PayPal's card generator.", 403);
  const order = await requireOrder(orderId);
  if (order.payment?.paypalOrderId !== paypalOrderId) throw new NexusError("PayPal order doesn't belong to this order", 409);
  if (order.status !== "payment_pending") throw new NexusError(`Order is ${order.status.replace(/_/g, " ")}`, 409);

  // Card-testing defence: pause card payments after a burst of declines.
  const since = Date.now() - VELOCITY_WINDOW_MS;
  const declines = (await store.listOrders(500)).flatMap((o) => o.payment?.cardAttempts ?? []).filter((a) => !a.approved && Date.parse(a.at) >= since).length;
  if (declines >= CARD_TESTING_LIMIT) {
    await securityEvent("card-testing", "high", "Paused card payments", `${declines} declined cards in 10 minutes looks like card testing.`, orderId);
    throw new NexusError("Too many declined cards in a short time. Card payments are paused for 10 minutes; you can still pay with PayPal.", 429);
  }

  const result = evaluateTestCard({ ...card, amountCents: order.totalCents });
  const label = `${result.brand ?? "Card"} ending ${result.last4 || "????"}`;
  const attempt: CardAttempt = {
    at: nowIso(),
    brand: result.brand,
    last4: result.last4,
    result: result.result,
    respmsg: result.respmsg,
    approved: result.approved,
    cvv2Match: result.cvv2Match,
    avsAddr: result.avsAddr,
    avsZip: result.avsZip,
    processor: result.processor,
    ccUpdated: result.ccUpdated,
    updatedLast4: result.updatedLast4,
    updatedExpiry: result.updatedExpiry,
  };
  const updater = result.ccUpdated
    ? ` · CCUPDATED=Y${result.updatedLast4 ? ` ACCT=…${result.updatedLast4}` : ""}${result.updatedExpiry ? ` EXPDATE=${result.updatedExpiry}` : ""}`
    : "";
  const checks = `CVV2MATCH=${result.cvv2Match ?? "-"} · AVSADDR=${result.avsAddr ?? "-"} · AVSZIP=${result.avsZip ?? "-"}${updater}`;
  let updated = await store.updateOrder(orderId, (o) => {
    o.payment!.cardAttempts = [...(o.payment!.cardAttempts ?? []), attempt];
    o.timeline.push(
      result.approved
        ? timeline("Card approved", `${label} · RESULT 0 Approved · ${checks}`)
        : timeline("Card declined", `${label} · RESULT ${result.result} ${result.respmsg} · ${checks}`, "error"),
    );
  });
  if (!result.approved) return { order: updated, card: result };

  await simulatedGateway.approve(paypalOrderId);
  await store.updateOrder(orderId, (o) => {
    o.payment!.status = "APPROVED";
    o.payment!.method = "card";
    lifecycle(o, "approved", `${label} approved by the test card network`);
  });
  updated = await capturePayment(orderId, paypalOrderId);
  return { order: updated, card: result };
}

/** Demo control: replay a webhook with a forged signature to show rejection. */
export async function simulateForgedWebhook(orderId: string): Promise<{ status: number; detail: string }> {
  if (paypalConfigured()) throw new NexusError("Only available in simulator mode", 403);
  const order = await requireOrder(orderId);
  if (!order.payment?.captureId) throw new NexusError("Capture the payment first", 409);
  const view = await simulatedGateway.getOrder(order.payment.paypalOrderId);
  const hook = simulatedGateway.buildWebhook(view);
  hook.headers.set("paypal-transmission-sig", "0".repeat(64));
  return processWebhook(hook.headers, hook.body);
}

/** Simulator only: deliver a signed refund or dispute event for a captured order. */
export async function simulatePaymentEvent(orderId: string, kind: "refund" | "dispute"): Promise<{ status: number; detail: string }> {
  if (paypalConfigured()) throw new NexusError("Only available in simulator mode", 403);
  const order = await requireOrder(orderId);
  if (!order.payment?.captureId) throw new NexusError("Capture the payment first", 409);
  const view = await simulatedGateway.getOrder(order.payment.paypalOrderId);
  const hook = simulatedGateway.buildWebhook(view, kind === "refund" ? "PAYMENT.CAPTURE.REFUNDED" : "CUSTOMER.DISPUTE.CREATED");
  return processWebhook(hook.headers, hook.body);
}

export function paymentConfig() {
  const gateway = getGateway();
  return {
    provider: gateway.provider,
    clientId: gateway.clientId,
    environment: "sandbox" as const,
    webhookRequired: webhookRequired(),
  };
}
