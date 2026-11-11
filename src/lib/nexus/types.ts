/**
 * Core domain types for PayPal Nexus.
 *
 * All money is integer cents (USD). Anything that reaches the browser goes
 * through `toPublic*` helpers so merchant floor prices never leak.
 */

export type Cents = number;
export type Currency = "USD";

export type Category = "laptop" | "monitor" | "headphones" | "tablet" | "phone" | "land" | "house" | "rental" | "car";

/** Big-ticket and rental deals: PayPal takes a refundable booking token, the rest is settled with the seller. */
export const BOOKING_CATEGORIES: Category[] = ["land", "house", "rental", "car"];

export type UseCase =
  | "video-editing"
  | "gaming"
  | "programming"
  | "student"
  | "business"
  | "travel"
  | "creative"
  | "general";

export type Priority = "price" | "warranty" | "delivery" | "value" | "balanced";

export type MerchantId = "atelier" | "bolt" | "cove";
export type AgentId = "buyer" | "coordinator" | MerchantId;
export type Archetype = "premium" | "competitive" | "retention";

export interface PurchaseIntent {
  rawQuery: string;
  category: Category;
  quantity: number;
  /** Hard ceiling for the delivered total. Never shared with merchants. */
  budgetCents: Cents | null;
  /**
   * Discount off list the shopper asked for, as a fraction (0.3 = "30% off").
   * Unlike the budget this is shared with stores: it is the buyer's opening ask.
   */
  askDiscountPct?: number | null;
  useCase: UseCase | null;
  minRamGb: number | null;
  /** Homes and rentals: at least this many bedrooms. */
  minBedrooms?: number | null;
  minStorageGb: number | null;
  maxWeightKg: number | null;
  needsDedicatedGpu: boolean;
  minWarrantyMonths: number | null;
  maxDeliveryDays: number | null;
  preferredBrands: string[];
  /** Set when the shopper names an exact model. */
  targetProductId: string | null;
  /** Hard brand requirement, e.g. "Apple" when the shopper asks for a MacBook. */
  requiredBrand: string | null;
  /** Hard product-line requirement, e.g. "MacBook Pro" or "iPhone". */
  requiredFamily: string | null;
  priority: Priority;
  summary: string;
  source: "gemini" | "rules";
}

export interface ProductSpecs {
  cpu?: string;
  ramGb?: number;
  storageGb?: number;
  gpu?: string;
  dedicatedGpu?: boolean;
  displayIn?: number;
  display?: string;
  weightKg?: number;
  batteryHours?: number;
  refreshHz?: number;
  noiseCancelling?: boolean;
  camera?: string;
  // Property and rentals
  location?: string;
  areaSqft?: number;
  acres?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnished?: boolean;
  zoning?: string;
  // Cars
  year?: number;
  fuel?: string;
  seats?: number;
  rangeMiles?: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: Category;
  description: string;
  specs: ProductSpecs;
  suitedFor: UseCase[];
  msrpCents: Cents;
  /** Visual tile hue (0–360), used when there's no product photo. */
  hue: number;
  /** Product line, e.g. "MacBook Pro", "iPhone", "Galaxy". */
  family: string;
  /** Lower-case names shoppers type for this exact model (longest wins). */
  aliases: string[];
  /** Optional licensed photo under /public, e.g. "/products/apple-iphone-17.webp". */
  image?: string;
}

export interface BundleItem {
  id: string;
  name: string;
  valueCents: Cents;
  /** What the item costs the merchant to give away. */
  costCents: Cents;
  /** Categories this add-on makes sense for. */
  categories: Category[];
}

export interface Listing {
  id: string;
  merchantId: MerchantId;
  productId: string;
  listPriceCents: Cents;
  /** Private: lowest unit price the merchant can accept. */
  floorPriceCents: Cents;
  stock: number;
  baseWarrantyMonths: number;
  maxWarrantyMonths: number;
  /** Merchant cost of each extra 12 months of warranty. */
  warrantyCostPerYearCents: Cents;
  /** Private: merchant's unit cost of goods. */
  costCents: Cents;
  /** Private: hard ceiling on the selling price. The opening ask is listPriceCents. */
  maxSellingPriceCents: Cents;
  standardDeliveryDays: number;
  expressDeliveryDays: number;
  expressCostCents: Cents;
  shippingCents: Cents;
  /** Private, optional per-item override of the store's maximum discount (e.g. clearance stock). */
  maxDiscountPct?: number | null;
  /** Private, optional per-item override of the store's opening discount. */
  openingDiscountPct?: number | null;
  /**
   * The store's agent sells this on behalf of an owner (property, rentals,
   * cars): the owner's own price limits apply, not the store's promo budget.
   */
  sellerListing?: boolean;
}

export type ConcessionLever = "price" | "warranty" | "express" | "shipping" | "bundle";
export type IncentiveLever = Exclude<ConcessionLever, "price">;
export const INCENTIVE_LEVERS: IncentiveLever[] = ["warranty", "express", "shipping", "bundle"];

/** What a merchant still has available to spend, derived from its budget ledger. */
export interface BudgetRemaining {
  concessionCents: Cents;
  incentiveCents: Record<IncentiveLever, Cents>;
}

export interface MerchantPolicy {
  /** Maximum discount from list price, as a fraction (0.08 = 8%). */
  maxDiscountPct: number;
  /**
   * Share of the maximum discount the agents may ever use (0.8 = never past
   * 80% of it), so every deal leaves the store a margin buffer.
   */
  agentLimitPct: number;
  /**
   * Discount the store opens with when a shopper names the discount they want.
   * The mutual deal then meets the shopper halfway, within the agent limit.
   */
  openingDiscountPct: number;
  /** Share of remaining negotiable room conceded in each round. */
  concessionCurve: number[];
  /** Responds to competitor quotes the buyer cites. */
  priceMatch: boolean;
  /** How far below a competitor's comparable price the merchant will go. */
  priceMatchBeatCents: Cents;
  /** Levers in order of preference when the buyer pushes back. */
  levers: ConcessionLever[];
  bundleCatalog: BundleItem[];
  maxBundleValueCents: Cents;
  offerValidityMinutes: number;
  /** Private commercial guardrails (merchant workspace). */
  minProfitCents: Cents;
  minMarginPct: number;
  /** Total price concessions (list − sold) the merchant will fund across deals. */
  concessionBudgetCents: Cents;
  /** Total incentive spend (warranty, express, shipping, bundles) across deals. */
  campaignBudgetCents: Cents;
  /** Share of the campaign budget allotted to each incentive lever. */
  incentiveAllocation: Record<IncentiveLever, number>;
  /** Paused merchants decline every RFQ. */
  active: boolean;
  /** Runtime snapshot of remaining budget, injected per negotiation. */
  remaining?: BudgetRemaining;
}

export type PublicMerchant = Omit<MerchantProfile, "policy">;

export interface MerchantProfile {
  id: MerchantId;
  name: string;
  archetype: Archetype;
  tagline: string;
  persona: string;
  /** Public summary of how this merchant negotiates. */
  publicPolicy: string[];
  /** Published return window, in days. */
  returnDays: number;
  policy: MerchantPolicy;
  /** Accent name, e.g. "sapphire". */
  accent: "sapphire" | "amber" | "teal";
}

/** Bundle item as it appears in offers (merchant cost stays server-side). */
export interface OfferBundleItem {
  id: string;
  name: string;
  valueCents: Cents;
}

export interface OfferTerms {
  listingId: string;
  merchantId: MerchantId;
  productId: string;
  quantity: number;
  currency: Currency;
  listPriceCents: Cents;
  unitPriceCents: Cents;
  shippingCents: Cents;
  /** Shipping at list (before any negotiated waiver). */
  listShippingCents: Cents;
  warrantyMonths: number;
  deliveryDays: number;
  express: boolean;
  returnDays: number;
  bundle: OfferBundleItem[];
  expiresAt: string;
}

export type OfferKind = "opening" | "counter" | "final" | "declined";

export interface Offer {
  id: string;
  round: number;
  merchantId: MerchantId;
  /** 1-based version of this merchant's offer within the negotiation (0 = declined). */
  version: number;
  kind: OfferKind;
  terms: OfferTerms | null;
  totalCents: Cents | null;
  message: string;
  /** Which policy levers moved this round. */
  levers: ConcessionLever[];
  /** How the merchant's move was produced. */
  strategy: "policy" | "gemini+policy";
  /** Set when the merchant met the buyer's counter exactly. */
  acceptsCounterId?: string;
  /** Raised by the policy engine when it had to correct the AI's move. */
  guardrail?: { messageRejected?: boolean; priceClamped?: boolean };
  createdAt: string;
}

export interface BuyerCounter {
  id: string;
  round: number;
  merchantId: MerchantId;
  targetUnitPriceCents: Cents;
  ask: {
    warrantyMonths?: number;
    express?: boolean;
    freeShipping?: boolean;
    bundle?: boolean;
  };
  leverage: { merchantId: MerchantId; productId: string; totalCents: Cents; sameProduct: boolean } | null;
  message: string;
  createdAt: string;
}

export type AgentMessageKind =
  | "rfq"
  | "offer"
  | "counter"
  | "accept"
  | "decline"
  | "note"
  | "final";

export interface AgentMessage {
  id: string;
  round: number;
  from: AgentId;
  to: AgentId | "all";
  kind: AgentMessageKind;
  text: string;
  offerId?: string;
  counterId?: string;
  createdAt: string;
}

/** Dollar-denominated utility: what each term is worth to this buyer. */
export interface ScoreBreakdown {
  /** Delivered total. */
  priceCents: Cents;
  /** Value of warranty beyond 12 months. */
  warrantyValueCents: Cents;
  /** Value of arriving faster than a 5-day baseline. */
  deliveryValueCents: Cents;
  /** Value of bundled extras (discounted from retail). */
  extrasValueCents: Cents;
  /** Penalty for missing a soft requirement (warranty/delivery). */
  penaltyCents: Cents;
  /** 0–1 product suitability. */
  fit: number;
  /** 0–1: cheapest effective cost / this offer's effective cost. */
  costScore: number;
  /** 0–1 score on the buyer's stated priority (0 when balanced). */
  priorityScore: number;
  /** The weights actually used to combine the scores. */
  weights: { cost: number; priority: number; fit: number };
}

export interface RankedOffer {
  offerId: string;
  merchantId: MerchantId;
  score: number;
  totalCents: Cents;
  /** Total minus the value of warranty, delivery speed and extras. */
  effectiveCents: Cents;
  savingsCents: Cents;
  withinBudget: boolean;
  meetsRequirements: boolean;
  breakdown: ScoreBreakdown;
  reasons: string[];
}

export interface NegotiationResult {
  rounds: number;
  ranking: RankedOffer[];
  recommendedOfferId: string | null;
  recommendation: string;
  completedAt: string;
}

/** Every check is PASSED, FAILED or UNKNOWN — never assumed. */
export type CheckStatus = "pass" | "fail" | "unknown";

export interface VerificationCheck {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  /** Essential checks must PASS; an essential UNKNOWN blocks like a FAIL. */
  essential: boolean;
  detail: string;
  evidence: string[];
  checkedAt: string;
}

export interface VerificationReport {
  ok: boolean;
  checkedAt: string;
  checks: VerificationCheck[];
}

export interface Agreement {
  id: string;
  sessionId: string;
  offerId: string;
  merchantId: MerchantId;
  terms: OfferTerms;
  totalCents: Cents;
  agreedAt: string;
  /** Increments each time this session agrees new terms. */
  version: number;
  termsHash: string;
  signature: string;
  verification: VerificationReport;
}

export type ChatRole = "user" | "buyer";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  via?: "chat" | "voice";
}

export type SessionStatus =
  | "intake"
  | "negotiating"
  | "negotiated"
  | "agreed"
  | "ordered"
  | "failed";

export interface CommerceSession {
  /** Anonymous browser device ID that opened the session (fraud signal only). */
  deviceId?: string | null;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  intent: PurchaseIntent | null;
  chat: ChatMessage[];
  messages: AgentMessage[];
  offers: Offer[];
  counters: BuyerCounter[];
  result: NegotiationResult | null;
  agreement: Agreement | null;
  orderId: string | null;
  /** Bumped on every re-negotiation so stale streams can be ignored. */
  negotiationRun: number;
  /** How many agreements this session has signed (agreement version source). */
  agreementCount?: number;
}

export type OrderStatus =
  | "awaiting_approval"
  | "approved"
  | "payment_pending"
  | "payment_captured"
  | "confirmed"
  | "payment_failed"
  | "refunded"
  | "disputed"
  | "cancelled";

export interface OrderLineItem {
  sku: string;
  name: string;
  kind: "product" | "bundle" | "warranty" | "service";
  quantity: number;
  unitPriceCents: Cents;
}

export type PaymentProvider = "paypal-sandbox" | "simulated";

export interface WebhookRecord {
  eventId: string;
  eventType: string;
  receivedAt: string;
  signatureVerified: boolean;
  detail: string;
}

export type PaymentState =
  | "created"
  | "awaiting_approval"
  | "approved"
  | "capturing"
  | "captured"
  | "failed"
  | "refunded"
  | "disputed";

export interface PaymentLifecycleEntry {
  state: PaymentState;
  at: string;
  detail: string;
}

/** One test-card attempt in the simulator. Never holds the full card number or CVV. */
export interface CardAttempt {
  at: string;
  brand: string | null;
  last4: string;
  result: number;
  respmsg: string;
  approved: boolean;
  cvv2Match: "Y" | "N" | "X" | null;
  avsAddr: "Y" | "N" | "X" | null;
  avsZip: "Y" | "N" | "X" | null;
  /** Simulated processing platform, e.g. "payflow-simulator", "tsys". */
  processor: string;
  /** Litle Account Updater (CCUPDATED=Y): replaced last 4 and/or expiry. */
  ccUpdated?: boolean;
  updatedLast4?: string | null;
  updatedExpiry?: string | null;
}

export interface PaymentRecord {
  provider: PaymentProvider;
  paypalOrderId: string;
  /** Set while a capture is in flight, so a second capture can't run at the same time. */
  captureLockAt?: string | null;
  status: "CREATED" | "APPROVED" | "COMPLETED" | "DECLINED" | "FAILED" | "REFUNDED" | "DISPUTED";
  createdAt: string;
  /** Payment lifecycle as observed by the backend. */
  lifecycle: PaymentLifecycleEntry[];
  /** How the buyer paid: PayPal account or card. */
  method?: "paypal" | "card";
  /** Simulator test-card attempts, oldest first. */
  cardAttempts?: CardAttempt[];
  expectedPayee: { merchantId?: string; email?: string } | null;
  captureId: string | null;
  capturedAt: string | null;
  capturedAmountCents: Cents | null;
  capturedCurrency: string | null;
  verification: VerificationReport | null;
  webhooks: WebhookRecord[];
}

export interface TimelineEntry {
  at: string;
  label: string;
  detail: string;
  status: "done" | "info" | "error";
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskSignal {
  id: string;
  label: string;
  points: number;
  detail: string;
  /** "rule" for deterministic checks, "statistical" for anomaly detection. */
  source?: "rule" | "statistical";
}

/** Fraud check on a payment: score 0–100, with the reasons that produced it. */
export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  decision: "allow" | "confirm" | "block";
  signals: RiskSignal[];
  checkedAt: string;
}

export type SecurityEventKind =
  | "prompt-injection"
  | "indirect-injection"
  | "fraud-confirm"
  | "fraud-block"
  | "card-testing"
  | "webhook-forgery"
  | "webhook-replay"
  | "auth-failure"
  | "approval-tampered"
  | "duplicate-payment"
  | "agent-restricted"
  | "secret-leak-blocked";

export interface SecurityEvent {
  id: string;
  at: string;
  kind: SecurityEventKind;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  /** Session or order id the event relates to. */
  ref: string | null;
}

export interface NexusOrder {
  id: string;
  sessionId: string;
  agreementId: string;
  merchantId: MerchantId;
  status: OrderStatus;
  currency: Currency;
  lineItems: OrderLineItem[];
  subtotalCents: Cents;
  listSubtotalCents: Cents;
  savingsCents: Cents;
  shippingCents: Cents;
  /** What PayPal charges now. For a booking (property, rental, car) this is the refundable token. */
  totalCents: Cents;
  /**
   * Set for property, rental and car deals: PayPal takes only a refundable
   * booking token; the agreed price is settled with the seller at closing.
   */
  booking?: {
    /** The full negotiated price (incl. fees) agreed with the seller. */
    dealTotalCents: Cents;
    /** Paid to the seller later, outside this app. */
    balanceDueCents: Cents;
    /** How the token was worked out, in plain words. */
    rule: string;
    refundable: true;
  } | null;
  terms: OfferTerms;
  termsHash: string;
  signature: string;
  agreementVersion: number;
  approval: {
    approvedAt: string;
    termsHash: string;
    amountCents: Cents;
    agreementVersion: number;
    /** Bound into the signature: the approval is only valid for this store and currency. */
    merchantId?: MerchantId;
    currency?: Currency;
    /** Approvals are short-lived; paying after this needs a fresh approval. */
    expiresAt?: string;
    /** Server HMAC over all of the above plus the order id. */
    signature?: string;
  } | null;
  /** Latest fraud check before payment. */
  risk?: RiskAssessment | null;
  /** When the shopper confirmed a payment the fraud check asked about. */
  riskConfirmedAt?: string | null;
  /** Anonymous browser device ID that started payment (fraud signal only). */
  deviceId?: string | null;
  /** How many times payment was started for this order. */
  paymentAttempts?: number;
  payment: PaymentRecord | null;
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export type NegotiationEvent =
  | { type: "phase"; phase: "discovery" | "negotiating" | "deciding" | "complete"; round: number; label: string }
  | { type: "message"; message: AgentMessage }
  | { type: "offer"; offer: Offer }
  | { type: "counter"; counter: BuyerCounter }
  | { type: "result"; result: NegotiationResult }
  | { type: "error"; error: string };

export type LedgerEntryType = "reserve" | "release" | "commit";

/** Merchant offer-budget ledger. Reserve on agreement, release on cancel. */
export interface LedgerEntry {
  id: string;
  merchantId: MerchantId;
  at: string;
  type: LedgerEntryType;
  sessionId: string;
  orderId: string | null;
  concessionCents: Cents;
  incentiveCents: Record<IncentiveLever, Cents>;
  note: string;
}
