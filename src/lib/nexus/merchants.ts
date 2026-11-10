import "server-only";
import { MERCHANT_DIRECTORY } from "./directory";
import { dollars } from "./money";
import type { MerchantId, MerchantPolicy, MerchantProfile } from "./types";

/** Seed negotiation policies and commercial guardrails. Server-only. */
export const SEED_POLICIES: Record<MerchantId, MerchantPolicy> = {
  atelier: {
    maxDiscountPct: 0.07,
    agentLimitPct: 0.8,
    openingDiscountPct: 0.02,
    concessionCurve: [0.3, 0.55, 0.8],
    priceMatch: false,
    priceMatchBeatCents: 0,
    levers: ["warranty", "express", "price"],
    bundleCatalog: [],
    maxBundleValueCents: 0,
    offerValidityMinutes: 30,
    minProfitCents: dollars(40),
    minMarginPct: 0.08,
    concessionBudgetCents: dollars(3000),
    campaignBudgetCents: dollars(1500),
    incentiveAllocation: { warranty: 0.6, express: 0.4, shipping: 0, bundle: 0 },
    active: true,
  },
  bolt: {
    maxDiscountPct: 0.13,
    agentLimitPct: 0.8,
    openingDiscountPct: 0.04,
    concessionCurve: [0.4, 0.7, 1],
    priceMatch: true,
    priceMatchBeatCents: dollars(10),
    levers: ["price", "shipping", "express", "warranty"],
    bundleCatalog: [],
    maxBundleValueCents: 0,
    offerValidityMinutes: 15,
    minProfitCents: dollars(20),
    minMarginPct: 0.05,
    concessionBudgetCents: dollars(5000),
    campaignBudgetCents: dollars(800),
    incentiveAllocation: { warranty: 0.1, express: 0.2, shipping: 0.7, bundle: 0 },
    active: true,
  },
  cove: {
    maxDiscountPct: 0.09,
    agentLimitPct: 0.8,
    openingDiscountPct: 0.03,
    concessionCurve: [0.25, 0.5, 0.75],
    priceMatch: false,
    priceMatchBeatCents: 0,
    levers: ["bundle", "warranty", "price"],
    bundleCatalog: [
      { id: "sleeve", name: "Padded laptop sleeve", valueCents: dollars(49), costCents: dollars(12), categories: ["laptop", "tablet"] },
      { id: "mouse", name: "Wireless precision mouse", valueCents: dollars(39), costCents: dollars(11), categories: ["laptop"] },
      { id: "hub", name: "7-in-1 USB-C hub", valueCents: dollars(69), costCents: dollars(19), categories: ["laptop", "tablet", "monitor"] },
      { id: "backup", name: "6 months cloud backup", valueCents: dollars(36), costCents: dollars(5), categories: ["laptop", "tablet"] },
      { id: "case", name: "Hard-shell travel case", valueCents: dollars(35), costCents: dollars(9), categories: ["headphones"] },
      { id: "cable", name: "Braided cable kit", valueCents: dollars(25), costCents: dollars(6), categories: ["headphones", "monitor"] },
      { id: "stylus", name: "Precision stylus", valueCents: dollars(79), costCents: dollars(24), categories: ["tablet"] },
      { id: "phone-case", name: "Protective phone case", valueCents: dollars(39), costCents: dollars(8), categories: ["phone"] },
      { id: "charger", name: "Fast charger and cable", valueCents: dollars(45), costCents: dollars(12), categories: ["phone", "tablet"] },
      { id: "calibration", name: "Colour calibration service", valueCents: dollars(59), costCents: dollars(14), categories: ["monitor"] },
    ],
    maxBundleValueCents: dollars(160),
    offerValidityMinutes: 30,
    minProfitCents: dollars(30),
    minMarginPct: 0.07,
    concessionBudgetCents: dollars(3500),
    campaignBudgetCents: dollars(2000),
    incentiveAllocation: { warranty: 0.3, express: 0, shipping: 0, bundle: 0.7 },
    active: true,
  },
};

/** Seed merchant profiles (tests and defaults). Live config lives in the store. */
export const MERCHANTS: Record<MerchantId, MerchantProfile> = {
  atelier: { ...MERCHANT_DIRECTORY.atelier, policy: SEED_POLICIES.atelier },
  bolt: { ...MERCHANT_DIRECTORY.bolt, policy: SEED_POLICIES.bolt },
  cove: { ...MERCHANT_DIRECTORY.cove, policy: SEED_POLICIES.cove },
};

export { MERCHANT_IDS, AGENTS, agentName } from "./directory";
