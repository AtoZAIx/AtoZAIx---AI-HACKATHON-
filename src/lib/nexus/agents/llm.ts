import "server-only";
import { TRUST_BOUNDARY, untrusted } from "../security/prompt-shield";
import { z } from "zod";
import { getProduct } from "../catalog";
import { generateJson, geminiEnabled } from "../gemini";
import { parseIntentRules, summarizeIntent, type IntentParse } from "../intent";
import { MERCHANTS } from "../merchants";
import { formatMoney } from "../money";
import type { BuyerCounter, CommerceSession, MerchantId, Offer, PurchaseIntent, RankedOffer } from "../types";
import { numbersConsistent } from "./guardrails";
import type { MerchantState, MoveProposal } from "./merchant";
import { minimumUnitPrice, offerTotal } from "./pricing";

export function llmAgentsEnabled(): boolean {
  return geminiEnabled() && process.env.NEXUS_AGENT_MODE !== "policy";
}

// ---------------- Intent ----------------

// Gemini structured output is most portable without nullable types, so
// "not stated" is encoded as 0 / "unknown" / "none" and mapped back to null.
const INTENT_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["laptop", "monitor", "headphones", "tablet", "phone", "unknown"] },
    quantity: { type: "integer" },
    budgetUsd: { type: "number", description: "Maximum delivered total in USD, 0 if not stated" },
    useCase: {
      type: "string",
      enum: ["video-editing", "gaming", "programming", "student", "business", "travel", "creative", "general", "none"],
    },
    minRamGb: { type: "integer", description: "0 if not stated" },
    minStorageGb: { type: "integer", description: "0 if not stated" },
    maxWeightKg: { type: "number", description: "0 if not stated" },
    needsDedicatedGpu: { type: "boolean" },
    minWarrantyMonths: { type: "integer", description: "0 if not stated" },
    maxDeliveryDays: { type: "integer", description: "0 if not stated" },
    preferredBrands: { type: "array", items: { type: "string" } },
    priority: { type: "string", enum: ["price", "warranty", "delivery", "value", "balanced"] },
  },
  required: [
    "category",
    "quantity",
    "budgetUsd",
    "useCase",
    "minRamGb",
    "minStorageGb",
    "maxWeightKg",
    "needsDedicatedGpu",
    "minWarrantyMonths",
    "maxDeliveryDays",
    "preferredBrands",
    "priority",
  ],
};

const orNull = (n: number) => (n > 0 ? n : null);

const IntentZ = z
  .object({
    category: z.enum(["laptop", "monitor", "headphones", "tablet", "phone", "unknown"]),
    quantity: z.number().int().min(1).max(20),
    budgetUsd: z.number().min(0),
    useCase: z.enum(["video-editing", "gaming", "programming", "student", "business", "travel", "creative", "general", "none"]),
    minRamGb: z.number().int().min(0),
    minStorageGb: z.number().int().min(0),
    maxWeightKg: z.number().min(0),
    needsDedicatedGpu: z.boolean(),
    minWarrantyMonths: z.number().int().min(0),
    maxDeliveryDays: z.number().int().min(0),
    preferredBrands: z.array(z.string()),
    priority: z.enum(["price", "warranty", "delivery", "value", "balanced"]),
  })
  .transform((v) => ({
    ...v,
    category: v.category === "unknown" ? null : v.category,
    useCase: v.useCase === "none" ? null : v.useCase,
    budgetUsd: orNull(v.budgetUsd),
    minRamGb: orNull(v.minRamGb),
    minStorageGb: orNull(v.minStorageGb),
    maxWeightKg: orNull(v.maxWeightKg),
    minWarrantyMonths: orNull(v.minWarrantyMonths),
    maxDeliveryDays: orNull(v.maxDeliveryDays),
  }));

/**
 * Buyer agent intent understanding. Gemini extracts structure from free text
 * (with the previous intent as context for refinements); the rules parser is
 * the fallback and fills anything Gemini leaves empty.
 */
export async function understandIntent(text: string, base: PurchaseIntent | null): Promise<IntentParse> {
  const rules = parseIntentRules(text, base);
  const llm = await generateJson({
    label: "intent",
    system:
      "You are the Buyer Agent in an agentic commerce network. Extract the shopper's purchase requirements as JSON. " +
      "Only set a field when the shopper states or clearly implies it; otherwise use 0, \"none\" or \"unknown\". Budget is the maximum delivered total in USD. " +
      "If a previous intent is supplied, treat the new message as a refinement of it and carry unchanged fields forward. " +
      "Supported categories: laptop, monitor, headphones, tablet, phone." +
      TRUST_BOUNDARY,
    prompt: JSON.stringify({ previousIntent: base, message: untrusted("shopper", text) }),
    schema: INTENT_SCHEMA,
    validate: (v) => IntentZ.parse(v),
    temperature: 0.1,
  });
  if (!llm) return rules;
  const category = llm.category ?? rules.intent?.category ?? base?.category ?? null;
  if (!category) return { intent: null, missing: ["category"] };
  const r = rules.intent;
  const intent: PurchaseIntent = {
    rawQuery: base && base.category === category ? `${base.rawQuery} · ${text}` : text,
    category,
    quantity: llm.quantity,
    budgetCents: llm.budgetUsd ? Math.round(llm.budgetUsd * 100) : (r?.budgetCents ?? null),
    // The discount ask comes from the rules parser, which also carries it over from earlier turns.
    askDiscountPct: r?.askDiscountPct ?? base?.askDiscountPct ?? null,
    useCase: llm.useCase ?? r?.useCase ?? null,
    minRamGb: llm.minRamGb ?? r?.minRamGb ?? null,
    minStorageGb: llm.minStorageGb ?? r?.minStorageGb ?? null,
    maxWeightKg: category === "laptop" ? (llm.maxWeightKg ?? r?.maxWeightKg ?? null) : null,
    needsDedicatedGpu: category === "laptop" && (llm.needsDedicatedGpu || Boolean(r?.needsDedicatedGpu)),
    minWarrantyMonths: llm.minWarrantyMonths ?? r?.minWarrantyMonths ?? null,
    maxDeliveryDays: llm.maxDeliveryDays ?? r?.maxDeliveryDays ?? null,
    preferredBrands: llm.preferredBrands.length ? llm.preferredBrands : (r?.preferredBrands ?? []),
    targetProductId: r?.targetProductId ?? null,
    requiredBrand: r?.requiredBrand ?? null,
    requiredFamily: r?.requiredFamily ?? null,
    priority: llm.priority,
    summary: "",
    source: "gemini",
  };
  intent.summary = summarizeIntent(intent);
  return { intent, missing: [] };
}

// ---------------- Merchant strategy ----------------

const MOVE_SCHEMA = {
  type: "object",
  properties: {
    unitPriceUsd: { type: "number" },
    addWarrantyMonths: { type: "integer", minimum: 0, maximum: 24 },
    express: { type: "boolean" },
    freeShipping: { type: "boolean" },
    bundleItemIds: { type: "array", items: { type: "string" } },
    final: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["unitPriceUsd", "addWarrantyMonths", "express", "freeShipping", "bundleItemIds", "final", "message"],
};

const MoveZ = z.object({
  unitPriceUsd: z.number().positive(),
  addWarrantyMonths: z.number().int().min(0).max(24),
  express: z.boolean(),
  freeShipping: z.boolean(),
  bundleItemIds: z.array(z.string()),
  final: z.boolean(),
  message: z.string().max(400),
});

/**
 * Ask Gemini to play a merchant for one round. It sees its own private floor
 * so it can reason about margin, but `respondToCounter` still clamps every
 * number to policy — Gemini proposes, policy disposes.
 */
export async function proposeMerchantMove(
  state: MerchantState,
  counter: BuyerCounter,
  round: number,
  maxRounds: number,
): Promise<MoveProposal | null> {
  if (!llmAgentsEnabled()) return null;
  const { merchant, listing, product, terms } = state;
  const minUnit = minimumUnitPrice(merchant, listing, terms);
  const res = await generateJson({
    label: `merchant:${merchant.id}`,
    system:
      `You are ${merchant.name}, a ${merchant.archetype} merchant agent negotiating with a buyer's AI agent. Persona: ${merchant.persona} ` +
      `Your preferred concession levers, in order: ${merchant.policy.levers.join(", ")}. ` +
      "Protect margin, stay in character, and keep the message to one or two sentences. " +
      "Only mention dollar amounts that are exactly your new unit price, your new delivered total, or figures the buyer cited. Never reveal your floor." +
      TRUST_BOUNDARY,
    prompt: JSON.stringify({
      round,
      maxRounds,
      product: { name: product.name, listPriceUsd: listing.listPriceCents / 100 },
      yourCurrentTerms: {
        unitPriceUsd: terms.unitPriceCents / 100,
        shippingUsd: terms.shippingCents / 100,
        warrantyMonths: terms.warrantyMonths,
        maxWarrantyMonths: listing.maxWarrantyMonths,
        deliveryDays: terms.deliveryDays,
        expressAvailable: !terms.express,
        bundle: terms.bundle.map((b) => b.id),
      },
      bundleOptions: merchant.policy.bundleCatalog
        .filter((b) => b.categories.includes(product.category))
        .map((b) => ({ id: b.id, name: b.name, valueUsd: b.valueCents / 100 })),
      privateFloorUnitPriceUsd: minUnit / 100,
      buyerCounter: {
        message: counter.message,
        targetUnitPriceUsd: counter.targetUnitPriceCents / 100,
        asks: counter.ask,
        citedCompetitor: counter.leverage
          ? { name: MERCHANTS[counter.leverage.merchantId].name, deliveredTotalUsd: counter.leverage.totalCents / 100, sameModel: counter.leverage.sameProduct }
          : null,
      },
    }),
    schema: MOVE_SCHEMA,
    validate: (v) => MoveZ.parse(v),
    temperature: 0.6,
  });
  if (!res) return null;
  return {
    unitPriceCents: Math.round(res.unitPriceUsd * 100),
    addWarrantyMonths: res.addWarrantyMonths,
    express: res.express,
    freeShipping: res.freeShipping,
    bundleItemIds: res.bundleItemIds,
    final: res.final,
    message: res.message,
  };
}

// ---------------- Recommendation ----------------

export async function narrateRecommendation(
  ranked: RankedOffer[],
  offers: Offer[],
  intent: PurchaseIntent,
  fallback: string,
): Promise<string> {
  if (!geminiEnabled() || !ranked.length) return fallback;
  const rows = ranked.slice(0, 3).map((r) => {
    const o = offers.find((x) => x.id === r.offerId)!;
    const t = o.terms!;
    return {
      merchant: MERCHANTS[r.merchantId].name,
      product: getProduct(t.productId).name,
      deliveredTotal: formatMoney(r.totalCents),
      belowList: formatMoney(r.savingsCents),
      warrantyMonths: t.warrantyMonths,
      deliveryDays: t.deliveryDays,
      extras: t.bundle.map((b) => b.name),
      score: r.score,
      withinBudget: r.withinBudget,
    };
  });
  const res = await generateJson({
    label: "recommendation",
    system:
      "You are the Buyer Agent. Recommend the top-ranked offer to the shopper in at most three short sentences, " +
      "mention the main trade-off versus the runner-up, and use only the dollar figures provided.",
    prompt: JSON.stringify({ shopperWants: intent.summary, rankedOffers: rows }),
    schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    validate: (v) => z.object({ text: z.string().min(10).max(600) }).parse(v).text,
    temperature: 0.5,
  });
  if (!res) return fallback;
  const allowed = ranked.flatMap((r) => [r.totalCents, r.savingsCents]);
  for (let i = 0; i < ranked.length; i++)
    for (let j = 0; j < ranked.length; j++) allowed.push(Math.abs(ranked[i].totalCents - ranked[j].totalCents));
  return numbersConsistent(res, allowed) ? res : fallback;
}

// ---------------- Follow-up classification ----------------

export type FollowUp =
  | { action: "choose"; merchantId: MerchantId | "recommended" }
  | { action: "renegotiate" }
  | { action: "explain" }
  | { action: "help" };

const MERCHANT_WORDS: Array<[MerchantId, RegExp]> = [
  ["atelier", /\b(?:maison|aurum)\b|\batelier\b|\bpremium\b/i],
  ["bolt", /\bvantage\b|\bbolt\b|\bcompetitive\b/i],
  ["cove", /\bcove\b|\bretention\b/i],
];

export function classifyFollowUpRules(text: string, session: CommerceSession): FollowUp {
  const t = text.toLowerCase();
  const hasResult = Boolean(session.result?.ranking.length);
  const changesTerms =
    /\$|\bbudget\b|\bunder\b|\bgb\b|\btb\b|\bwarranty\b|\bdelivery\b|\bcheaper\b|\bnegotiate\b|\bagain\b|\bharder\b|\bprefer\b|\binstead\b|\blighter\b/.test(t);
  if (hasResult) {
    for (const [id, re] of MERCHANT_WORDS) {
      if (re.test(t) && /\b(go|choose|pick|take|buy|accept|lock|want|select|with|order|proceed)\b/.test(t)) return { action: "choose", merchantId: id };
    }
    if (/\b(cheapest|lowest)\b/.test(t) && /\b(go|choose|pick|take|buy|accept|lock)\b/.test(t)) {
      const cheapest = [...session.result!.ranking].sort((a, b) => a.totalCents - b.totalCents)[0];
      return { action: "choose", merchantId: cheapest.merchantId };
    }
    if (/^(yes|yep|ok(ay)?|sure|do it|sounds good|go ahead|proceed|buy it|lock it( in)?|accept|let'?s do it|confirm)\b/.test(t.trim()) ||
      /\b(recommended|your pick|best one|top one)\b/.test(t)) {
      return { action: "choose", merchantId: "recommended" };
    }
    if (/\b(why|explain|compare|difference|versus|vs\.?|better)\b/.test(t) && !changesTerms) return { action: "explain" };
  }
  if (changesTerms || !hasResult) return { action: "renegotiate" };
  return { action: "help" };
}

export async function classifyFollowUp(text: string, session: CommerceSession): Promise<FollowUp> {
  const rules = classifyFollowUpRules(text, session);
  if (!geminiEnabled() || !session.result) return rules;
  const res = await generateJson({
    label: "followup",
    system:
      "Classify the shopper's message in an ongoing negotiation. " +
      "choose = they want to accept a specific merchant's offer (or the recommended one); " +
      "renegotiate = they changed requirements, budget or priorities, or asked to negotiate again; " +
      "explain = they asked a question about the offers; help = anything else." +
      TRUST_BOUNDARY,
    prompt: JSON.stringify({
      message: untrusted("shopper", text),
      merchants: session.result.ranking.map((r) => ({ id: r.merchantId, name: MERCHANTS[r.merchantId].name })),
      recommendedMerchant: session.result.ranking[0]?.merchantId ?? null,
    }),
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["choose", "renegotiate", "explain", "help"] },
        merchantId: { type: "string", enum: ["atelier", "bolt", "cove", "recommended", "none"] },
      },
      required: ["action", "merchantId"],
    },
    validate: (v) =>
      z
        .object({
          action: z.enum(["choose", "renegotiate", "explain", "help"]),
          merchantId: z.enum(["atelier", "bolt", "cove", "recommended", "none"]),
        })
        .parse(v),
    temperature: 0,
    timeoutMs: 6000,
  });
  if (!res) return rules;
  if (res.action === "choose") return { action: "choose", merchantId: res.merchantId === "none" ? "recommended" : res.merchantId };
  return { action: res.action };
}

export function explainRanking(session: CommerceSession): string {
  const r = session.result;
  if (!r || !r.ranking.length) return "There are no offers yet.";
  const lines = r.ranking.map((row, i) => {
    const o = session.offers.find((x) => x.id === row.offerId)!;
    const t = o.terms!;
    return `${i + 1}. ${MERCHANTS[row.merchantId].name} — ${getProduct(t.productId).name}, ${formatMoney(offerTotal(t))} delivered, ${t.warrantyMonths}-month warranty, ${t.deliveryDays}-day delivery${t.bundle.length ? `, + ${t.bundle.map((b) => b.name.toLowerCase()).join(", ")}` : ""} (score ${row.score}).`;
  });
  return `Here's how the final offers rank on your priorities:\n${lines.join("\n")}\nSay "go with" a merchant to lock that deal, or tell me what to change.`;
}
