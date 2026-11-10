import type { AgentId, MerchantId, PublicMerchant } from "./types";

/** Public merchant directory: safe to ship to the browser. */
export const MERCHANT_DIRECTORY: Record<MerchantId, PublicMerchant> = {
  atelier: {
    id: "atelier",
    name: "Maison Aurum",
    archetype: "premium",
    tagline: "Curated premium electronics, white-glove service",
    persona: "Polished, confident and protective of brand value. Prefers adding warranty and express delivery over cutting price.",
    publicPolicy: ["24-month warranty standard, extendable to 36", "Free 2-day delivery, 1-day express on request", "30-day returns", "Price moves are small and deliberate"],
    returnDays: 30,
    accent: "sapphire",
  },
  bolt: {
    id: "bolt",
    name: "Vantage Electronics",
    archetype: "competitive",
    tagline: "Lowest delivered price, or we move",
    persona: "Fast, numbers-first and competitive. Will price-match quotes the buyer cites and waive shipping to win.",
    publicPolicy: ["Price-matches the same model when the buyer cites it", "Standard 12-month warranty", "15-day returns", "Shipping waived on negotiated deals"],
    returnDays: 15,
    accent: "amber",
  },
  cove: {
    id: "cove",
    name: "Cove Commerce",
    archetype: "retention",
    tagline: "More in the box, customers for life",
    persona: "Warm and relationship-focused. Protects margin by adding bundles, loyalty perks and longer coverage.",
    publicPolicy: ["Bundles accessories instead of deep discounts", "Extended warranty partner up to 36 months", "45-day returns", "Free 3-day delivery"],
    returnDays: 45,
    accent: "teal",
  },
};

export const MERCHANT_IDS = Object.keys(MERCHANT_DIRECTORY) as MerchantId[];

export interface AgentProfile {
  id: AgentId;
  name: string;
  /** Short role label, e.g. "Merchant A — Premium". */
  role: string;
  description: string;
  capabilities: string[];
  simulated: boolean;
}

export const AGENTS: Record<AgentId, AgentProfile> = {
  buyer: {
    id: "buyer",
    name: "Buyer Agent",
    role: "Buyer Agent",
    description: "Represents the customer and protects the customer's requirements.",
    capabilities: ["Intent understanding", "Budget protection", "Competitive leverage", "Offer ranking"],
    simulated: false,
  },
  atelier: {
    id: "atelier",
    name: MERCHANT_DIRECTORY.atelier.name,
    role: "Merchant A — Premium",
    description: "Protects product quality, service and commercial margin.",
    capabilities: ["Warranty extensions", "Express delivery", "Margin protection"],
    simulated: true,
  },
  bolt: {
    id: "bolt",
    name: MERCHANT_DIRECTORY.bolt.name,
    role: "Merchant B — Competitive",
    description: "Prioritises competitive pricing and conversion.",
    capabilities: ["Price matching", "Shipping waivers", "Fast concessions"],
    simulated: true,
  },
  cove: {
    id: "cove",
    name: MERCHANT_DIRECTORY.cove.name,
    role: "Merchant C — Customer Retention",
    description: "Uses bundles, loyalty benefits and value-added incentives.",
    capabilities: ["Accessory bundles", "Extended coverage", "Loyalty incentives"],
    simulated: true,
  },
  coordinator: {
    id: "coordinator",
    name: "Nexus Coordinator",
    role: "Nexus Coordinator",
    description: "Coordinates negotiation rounds, validates state and manages communication.",
    capabilities: ["RFQ broadcast", "Round sequencing", "State validation", "Agreement signing"],
    simulated: false,
  },
};

export function agentName(id: AgentId | "all"): string {
  if (id === "all") return "All merchants";
  return AGENTS[id].name;
}
