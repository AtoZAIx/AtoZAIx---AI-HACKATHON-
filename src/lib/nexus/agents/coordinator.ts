import "server-only";
import { getProduct } from "../catalog";
import { newId, nowIso } from "../ids";
import { requestHead, USE_LABEL } from "../intent";
import { MERCHANTS, MERCHANT_IDS } from "../merchants";
import { formatMoney } from "../money";
import { vocabFor } from "../vocab";
import type {
  AgentId,
  AgentMessage,
  AgentMessageKind,
  Listing,
  MerchantId,
  NegotiationEvent,
  NegotiationResult,
  MerchantProfile,
  Offer,
  PurchaseIntent,
} from "../types";
import { anchorFor, buildCounter, describeRanking, effectiveAsk, rankOffers } from "./buyer";
import { proposeMerchantMove, narrateRecommendation, llmAgentsEnabled } from "./llm";
import { declineOffer, openingOffer, respondToCounter, selectListing, type MerchantState } from "./merchant";

export interface NegotiationOptions {
  /** Live merchant profiles (config + remaining budgets). Defaults to seeds. */
  merchants?: Record<MerchantId, MerchantProfile>;
  maxRounds?: number;
  paceMs?: number;
  signal?: AbortSignal;
}

function msg(round: number, from: AgentId, to: AgentId | "all", kind: AgentMessageKind, text: string, extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: newId("msg"), round, from, to, kind, text, createdAt: nowIso(), ...extra };
}

/** Requirements as broadcast to merchants: everything except the budget. */
export function publicRequirements(intent: PurchaseIntent): string {
  const parts = [`${intent.quantity > 1 ? `${intent.quantity} × ` : ""}${requestHead(intent)}${intent.useCase ? ` for ${USE_LABEL[intent.useCase]}` : ""}`];
  if (intent.minRamGb) parts.push(`${intent.minRamGb}GB+ RAM`);
  if (intent.minBedrooms) parts.push(`${intent.minBedrooms}+ bedrooms`);
  if (intent.minStorageGb) parts.push(intent.minStorageGb >= 1024 ? `${intent.minStorageGb / 1024}TB+ storage` : `${intent.minStorageGb}GB+ storage`);
  if (intent.needsDedicatedGpu) parts.push("dedicated GPU");
  if (intent.maxWeightKg) parts.push(`≤ ${intent.maxWeightKg}kg`);
  if (intent.minWarrantyMonths) parts.push(`${intent.minWarrantyMonths}+ month warranty`);
  if (intent.maxDeliveryDays) parts.push(`delivery ≤ ${intent.maxDeliveryDays} days`);
  return parts.join(", ");
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (!ms) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * The Nexus Coordinator. Runs a structured multi-round negotiation between
 * the buyer agent and every merchant agent, yielding protocol events as they
 * happen so the UI can render the room live.
 */
export async function* negotiate(
  intent: PurchaseIntent,
  listings: Listing[],
  opts: NegotiationOptions = {},
): AsyncGenerator<NegotiationEvent> {
  const maxRounds = opts.maxRounds ?? 3;
  const pace = opts.paceMs ?? 0;
  const pause = () => sleep(pace, opts.signal);
  const aborted = () => opts.signal?.aborted ?? false;
  const useLlm = llmAgentsEnabled();

  yield { type: "phase", phase: "discovery", round: 0, label: "Broadcasting request for quote" };
  const anchor = anchorFor(intent);
  yield {
    type: "message",
    message: msg(
      0,
      "coordinator",
      "all",
      "rfq",
      `Request for quote: ${publicRequirements(intent)}.${anchor ? ` Buyer target ≈ ${formatMoney(anchor)} ${vocabFor(intent.category).totalSuffix}.` : ""}${intent.askDiscountPct ? ` The shopper asks for ${Math.round(intent.askDiscountPct * 100)}% off list.` : ""} Offers are binding until they expire. Up to ${maxRounds} counter rounds; every store settles halfway between its opening and the buyer’s ask, within its own limits.`,
    ),
  };
  if (intent.budgetCents) {
    yield {
      type: "message",
      message: msg(0, "buyer", "coordinator", "note", "Requirements locked. My principal's budget ceiling stays private; I'll only share a target."),
    };
  }
  await pause();

  const states = new Map<MerchantId, MerchantState>();
  const latest = new Map<MerchantId, Offer>();

  for (const id of MERCHANT_IDS) {
    if (aborted()) return;
    const merchant = (opts.merchants ?? MERCHANTS)[id];
    const listing = selectListing(merchant, listings, { intent, targetTotalCents: anchor });
    let offer: Offer;
    if (!listing) {
      offer = declineOffer(
        merchant,
        0,
        merchant.policy.active
          ? `${merchant.name} has nothing in stock it can offer for these requirements.`
          : `${merchant.name} is not taking new negotiations right now.`,
      );
    } else {
      const opened = openingOffer(merchant, listing, { intent, targetTotalCents: anchor });
      states.set(id, opened.state);
      offer = opened.offer;
    }
    latest.set(id, offer);
    yield { type: "offer", offer };
    yield {
      type: "message",
      message: msg(0, id, "buyer", offer.kind === "declined" ? "decline" : "offer", offer.message, { offerId: offer.id }),
    };
    await pause();
  }

  let roundsRun = 0;
  for (let round = 1; round <= maxRounds; round++) {
    if (aborted()) return;
    const active = [...states.keys()].filter((id) => !states.get(id)!.final);
    if (!active.length) break;
    roundsRun = round;
    yield { type: "phase", phase: "negotiating", round, label: `Round ${round} of ${maxRounds}` };

    const snapshot = [...latest.values()];
    const counters = active.map((id) => buildCounter(latest.get(id)!, snapshot, intent, round));
    for (const c of counters) {
      yield { type: "counter", counter: c };
      yield { type: "message", message: msg(round, "buyer", c.merchantId, "counter", c.message, { counterId: c.id }) };
    }
    await pause();

    const proposals = useLlm
      ? await Promise.all(counters.map((c) => proposeMerchantMove(states.get(c.merchantId)!, c, round, maxRounds)))
      : counters.map(() => null);

    for (let i = 0; i < counters.length; i++) {
      if (aborted()) return;
      const c = counters[i];
      const state = states.get(c.merchantId)!;
      const offer = respondToCounter(state, c, { round, maxRounds, proposal: proposals[i], askDiscountPct: effectiveAsk(intent), namedAskPct: intent.askDiscountPct ?? null });
      latest.set(c.merchantId, offer);
      yield { type: "offer", offer };
      yield {
        type: "message",
        message: msg(round, c.merchantId, "buyer", offer.acceptsCounterId ? "accept" : offer.kind === "final" ? "final" : "offer", offer.message, {
          offerId: offer.id,
        }),
      };
      await pause();
    }
  }

  yield { type: "phase", phase: "deciding", round: roundsRun, label: "Buyer agent ranking final offers" };
  const finals = [...latest.values()];
  const ranking = rankOffers(finals, intent);
  const fallback = describeRanking(ranking, finals);
  const recommendation = await narrateRecommendation(ranking, finals, intent, fallback);
  const best = ranking[0];
  const result: NegotiationResult = {
    rounds: roundsRun,
    ranking,
    recommendedOfferId: best?.offerId ?? null,
    recommendation,
    completedAt: nowIso(),
  };
  if (best) {
    const product = getProduct(finals.find((o) => o.id === best.offerId)!.terms!.productId);
    yield {
      type: "message",
      message: msg(
        roundsRun,
        "buyer",
        "coordinator",
        "note",
        `Ranked ${ranking.length} final offer${ranking.length === 1 ? "" : "s"}. Recommending ${MERCHANTS[best.merchantId].name} (${product.name}, ${formatMoney(best.totalCents)}). Awaiting principal's choice.`,
      ),
    };
  }
  yield { type: "result", result };
  yield { type: "phase", phase: "complete", round: roundsRun, label: "Negotiation complete" };
}
