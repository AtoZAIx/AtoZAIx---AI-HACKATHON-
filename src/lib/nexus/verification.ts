import { findProduct, meetsRequirements } from "./catalog";
import { MERCHANT_DIRECTORY } from "./directory";
import { formatMoney } from "./money";
import { VOCAB, vocabFor } from "./vocab";
import { bundleValue, incentivesAffordable, minimumUnitPrice, offerTotal, priceConcession } from "./agents/pricing";
import type { CheckStatus, Listing, MerchantProfile, Offer, OfferTerms, PurchaseIntent, VerificationCheck, VerificationReport } from "./types";

export interface DealVerificationInput {
  sessionId: string;
  offerId: string;
  terms: OfferTerms;
  totalCents: number;
  termsHash: string;
  signature: string;
  /** The merchant's latest binding offer, as recorded by the coordinator. */
  recordedOffer: Offer | undefined;
  intent: PurchaseIntent;
  /** Live merchant profile: policy plus remaining budget. */
  merchant: MerchantProfile;
  /** Current listing state (live stock and private pricing). */
  listing: Listing | undefined;
  /** Whether a specific PayPal payee is configured for this merchant. */
  payeeConfigured: boolean;
  paymentMode: "paypal-sandbox" | "simulated";
  now?: Date;
  /** Injected so this module stays free of node:crypto for tests/clients. */
  hashTerms: (t: OfferTerms) => string;
  verifySignature: (sessionId: string, offerId: string, hash: string, sig: string) => boolean;
}

/**
 * A deal is verified only when every essential check PASSES. An essential
 * UNKNOWN blocks exactly like a FAIL; non-essential checks (soft preferences,
 * optional configuration) are shown but never block.
 */
export function reportOk(checks: VerificationCheck[]): boolean {
  return checks.every((c) => !c.essential || c.status === "pass");
}

/**
 * Deterministic Deal Verification Engine. Every rule is checked against the
 * recorded negotiation, the merchant's live policy and inventory. Nothing an
 * LLM said is trusted, and confidential merchant values are checked here but
 * never written into the evidence shown to customers.
 */
export function verifyDeal(input: DealVerificationInput): VerificationReport {
  const { terms, intent, listing, recordedOffer, merchant } = input;
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const product = findProduct(terms.productId);
  const checks: VerificationCheck[] = [];
  const add = (category: string, id: string, label: string, status: CheckStatus | boolean, essential: boolean, detail: string, evidence: string[]) =>
    checks.push({
      id,
      category,
      label,
      status: typeof status === "boolean" ? (status ? "pass" : "fail") : status,
      essential,
      detail,
      evidence,
      checkedAt: at,
    });

  // 1. Product identity
  add(
    "Product identity",
    "product",
    "Product matches the catalogue and listing",
    Boolean(product && listing && listing.productId === terms.productId && (!intent.targetProductId || intent.targetProductId === terms.productId)),
    true,
    product ? `${product.name} (${product.id})` : `Unknown product ${terms.productId}`,
    [
      `Catalogue entry: ${product ? `${product.brand} ${product.name}` : "missing"}`,
      `Listing ${terms.listingId}: ${listing ? listing.productId : "not found"}`,
      ...(intent.targetProductId ? [`Requested model: ${intent.targetProductId}`] : []),
    ],
  );

  // 2. Specifications
  const req = product ? meetsRequirements(product, intent) : { ok: false, misses: ["product unknown"] };
  add(
    "Specifications",
    "specs",
    "Meets your hard requirements",
    req.ok,
    true,
    req.ok ? "Every stated requirement is satisfied" : req.misses.join("; "),
    [
      ...(intent.minRamGb ? [`RAM ≥ ${intent.minRamGb}GB: ${product?.specs.ramGb ?? "?"}GB`] : []),
      ...(intent.minBedrooms ? [`Bedrooms ≥ ${intent.minBedrooms}: ${product?.specs.bedrooms ?? "?"}`] : []),
      ...(intent.minStorageGb ? [`Storage ≥ ${intent.minStorageGb}GB: ${product?.specs.storageGb ?? "?"}GB`] : []),
      ...(intent.needsDedicatedGpu ? [`Dedicated GPU: ${product?.specs.dedicatedGpu ? product.specs.gpu : "no"}`] : []),
      ...(intent.maxWeightKg ? [`Weight ≤ ${intent.maxWeightKg}kg: ${product?.specs.weightKg ?? "?"}kg`] : []),
      `Category: ${product?.category ?? "?"} (requested ${intent.category})`,
    ],
  );

  // 3. Merchant identity
  const known = Boolean(MERCHANT_DIRECTORY[terms.merchantId]);
  add(
    "Merchant identity",
    "merchant",
    "Merchant is registered in the network",
    known && listing?.merchantId === terms.merchantId,
    true,
    `${MERCHANT_DIRECTORY[terms.merchantId]?.name ?? terms.merchantId} · simulated merchant`,
    [`Directory id: ${terms.merchantId}`, `Listing owner: ${listing?.merchantId ?? "unknown"}`],
  );
  add(
    "Merchant identity",
    "payee",
    "PayPal payee for this merchant",
    input.payeeConfigured || input.paymentMode === "simulated" ? "pass" : "unknown",
    false,
    input.payeeConfigured
      ? "Merchant payee configured"
      : input.paymentMode === "simulated"
        ? "Simulator assigns a per-merchant payee"
        : "No per-merchant payee configured; PayPal will pin the API account as payee at order creation",
    ["Payee is re-checked against the captured payment"],
  );

  // 4. Price and currency
  const recomputed = offerTotal(terms);
  add(
    "Price and currency",
    "total",
    "Total recomputes and currency is supported",
    recomputed === input.totalCents && terms.currency === "USD",
    true,
    `${terms.quantity} × ${formatMoney(terms.unitPriceCents)} + ${formatMoney(terms.shippingCents)} ${(product ? vocabFor(product.category) : VOCAB.goods).feesNoun.toLowerCase()} = ${formatMoney(recomputed)} ${terms.currency}`,
    [`Agreed total ${formatMoney(input.totalCents)}`, `Settlement currency ${terms.currency} via PayPal`],
  );

  add(
    "Price and currency",
    "list-price",
    "Original price matches the merchant listing",
    listing ? terms.listPriceCents === listing.listPriceCents : "unknown",
    false,
    listing ? `List ${formatMoney(terms.listPriceCents)} per unit` : "Listing not found",
    ["Used to calculate the savings shown to you"],
  );

  // 5. Inventory
  add(
    "Inventory",
    "stock",
    "Inventory available",
    listing ? listing.stock >= terms.quantity : "unknown",
    true,
    listing ? `${listing.stock} in stock, ${terms.quantity} required` : "Listing not found",
    ["Live inventory read at verification time"],
  );

  // 6. Delivery
  if (listing) {
    const expectedDays = terms.express ? listing.expressDeliveryDays : listing.standardDeliveryDays;
    add("Delivery", "delivery", "Delivery promise matches merchant service", terms.deliveryDays === expectedDays, true, `${terms.deliveryDays}-day ${terms.express ? "express" : "standard"} delivery`, [
      `Merchant ${terms.express ? "express" : "standard"} service: ${expectedDays} days`,
    ]);
  } else add("Delivery", "delivery", "Delivery promise matches merchant service", "unknown", true, "Listing not found", []);
  if (intent.maxDeliveryDays) {
    add("Delivery", "delivery-need", "Arrives within your window", terms.deliveryDays <= intent.maxDeliveryDays, false, `${terms.deliveryDays} days vs ${intent.maxDeliveryDays} requested`, ["Soft preference"]);
  }

  // 7. Warranty
  if (listing) {
    add(
      "Warranty",
      "warranty",
      "Warranty is within what the merchant offers",
      terms.warrantyMonths >= listing.baseWarrantyMonths && terms.warrantyMonths <= listing.maxWarrantyMonths,
      true,
      `${terms.warrantyMonths} months`,
      [`Merchant warranty range ${listing.baseWarrantyMonths}–${listing.maxWarrantyMonths} months`],
    );
  } else add("Warranty", "warranty", "Warranty is within what the merchant offers", "unknown", true, "Listing not found", []);
  if (intent.minWarrantyMonths) {
    add("Warranty", "warranty-need", "Meets your warranty minimum", terms.warrantyMonths >= intent.minWarrantyMonths, false, `${terms.warrantyMonths} of ${intent.minWarrantyMonths} months requested`, ["Soft preference"]);
  }

  // 8. Return conditions
  const published = MERCHANT_DIRECTORY[terms.merchantId]?.returnDays;
  add(
    "Return conditions",
    "returns",
    "Return window matches published policy",
    published === undefined ? "unknown" : terms.returnDays === published,
    true,
    (product ? vocabFor(product.category) : VOCAB.goods).returns(terms.returnDays),
    [`Published policy: ${published ?? "unknown"} days`],
  );

  // 9. Merchant authorisation
  const recordedHash = recordedOffer?.terms ? input.hashTerms(recordedOffer.terms) : null;
  add(
    "Merchant authorisation",
    "binding",
    "Terms are the merchant's latest binding offer",
    Boolean(recordedOffer && recordedHash === input.termsHash && recordedOffer.merchantId === terms.merchantId && merchant.policy.active),
    true,
    recordedOffer ? `Offer v${recordedOffer.version} from round ${recordedOffer.round}` : "No binding offer with this id",
    [merchant.policy.active ? "Merchant is accepting negotiations" : "Merchant has paused negotiations", `Offer ${input.offerId}`],
  );
  add(
    "Merchant authorisation",
    "integrity",
    "Agreement signature valid",
    input.hashTerms(terms) === input.termsHash && input.verifySignature(input.sessionId, input.offerId, input.termsHash, input.signature),
    true,
    `SHA-256 ${input.termsHash.slice(0, 12)}…`,
    ["HMAC-SHA256 signed by the AtoZAIx Coordinator", "Hash covers every term, including expiry"],
  );

  // 10. Profit and concession policy (values stay confidential)
  if (listing) {
    const minUnit = minimumUnitPrice(merchant, listing, terms);
    const remainingAfterOwnReservation = merchant.policy.remaining;
    const withinPrice = terms.unitPriceCents >= minUnit && terms.unitPriceCents <= listing.maxSellingPriceCents;
    // Owner listings use the owner's limits (price floor), not the store's promo budget.
    const withinBudget = listing.sellerListing || !remainingAfterOwnReservation || priceConcession(terms) <= remainingAfterOwnReservation.concessionCents;
    const withinIncentives = incentivesAffordable(merchant, listing, terms);
    add(
      "Profit and concession policy",
      "policy",
      "Within the merchant's confidential pricing policy",
      withinPrice && withinBudget && withinIncentives,
      true,
      withinPrice && withinBudget && withinIncentives ? "Price, margin and concession budget checks passed" : "Outside the merchant's pricing policy",
      [
        `Selling price ${withinPrice ? "within" : "outside"} the merchant's allowed range`,
        `Concession ${withinBudget ? "within" : "exceeds"} remaining budget`,
        `Incentives ${withinIncentives ? "within" : "exceed"} campaign allocation`,
        "Exact thresholds are confidential to the merchant",
      ],
    );
  } else add("Profit and concession policy", "policy", "Within the merchant's confidential pricing policy", "unknown", true, "Listing not found", []);
  const bundleOk = terms.bundle.every((b) =>
    merchant.policy.bundleCatalog.some((c) => c.id === b.id && c.valueCents === b.valueCents && c.name === b.name && (!product || c.categories.includes(product.category))),
  );
  add(
    "Profit and concession policy",
    "bundle",
    "Included incentives are genuine",
    bundleOk && bundleValue(terms.bundle) <= merchant.policy.maxBundleValueCents,
    true,
    terms.bundle.length ? `${terms.bundle.length} item(s), ${formatMoney(bundleValue(terms.bundle))} retail value` : "No bundled items",
    terms.bundle.map((b) => `${b.name}: ${formatMoney(b.valueCents)}`),
  );

  // 11. Customer spending limit
  add(
    "Customer spending limit",
    "budget",
    "Within your spending limit",
    intent.budgetCents ? input.totalCents <= intent.budgetCents : "unknown",
    Boolean(intent.budgetCents),
    intent.budgetCents ? `${formatMoney(input.totalCents)} of ${formatMoney(intent.budgetCents)}` : "No spending limit was set",
    [intent.budgetCents ? "Limit kept private from merchants" : "Set a spending limit to have it enforced"],
  );

  // 12. Offer expiration
  const expires = new Date(terms.expiresAt);
  add(
    "Offer expiration",
    "expiry",
    "Offer still valid",
    expires.getTime() > now.getTime(),
    true,
    `Expires ${expires.toISOString().replace("T", " ").slice(0, 16)} UTC`,
    [`Checked ${at.replace("T", " ").slice(0, 19)} UTC`],
  );

  return { ok: reportOk(checks), checkedAt: at, checks };
}
