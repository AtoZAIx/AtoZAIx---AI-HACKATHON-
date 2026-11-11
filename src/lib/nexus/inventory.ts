import "server-only";
import { getProduct } from "./catalog";
import { charm, dollars } from "./money";
import type { Listing, MerchantId } from "./types";

/**
 * Private merchant inventory: list prices, floors and terms per listing.
 * Server-only so floors never reach the browser bundle.
 */
interface ListingSeed {
  productId: string;
  /** List price as a fraction of MSRP. */
  list: number;
  /** Floor price as a fraction of list price. */
  floor: number;
  stock: number;
  /**
   * Clearance stock bought below normal cost, with its own discount limits:
   * `cost` as a fraction of list, plus the item's maximum and opening discount.
   */
  clearance?: { cost: number; maxDiscount: number; opening: number };
}

interface MerchantTerms {
  /** Unit cost of goods as a fraction of list price. */
  costPct: number;
  baseWarrantyMonths: number;
  maxWarrantyMonths: number;
  warrantyCostPct: number;
  standardDeliveryDays: number;
  expressDeliveryDays: number;
  expressCostCents: number;
  shippingCents: number;
}

const MERCHANT_TERMS: Record<MerchantId, MerchantTerms> = {
  atelier: { costPct: 0.8, baseWarrantyMonths: 24, maxWarrantyMonths: 36, warrantyCostPct: 0.025, standardDeliveryDays: 2, expressDeliveryDays: 1, expressCostCents: dollars(18), shippingCents: 0 },
  bolt: { costPct: 0.82, baseWarrantyMonths: 12, maxWarrantyMonths: 24, warrantyCostPct: 0.05, standardDeliveryDays: 5, expressDeliveryDays: 2, expressCostCents: dollars(22), shippingCents: dollars(19) },
  cove: { costPct: 0.8, baseWarrantyMonths: 12, maxWarrantyMonths: 36, warrantyCostPct: 0.02, standardDeliveryDays: 3, expressDeliveryDays: 2, expressCostCents: dollars(20), shippingCents: 0 },
};

/**
 * Land, houses, rentals and cars are sold on behalf of owners: possession /
 * move-in time instead of delivery, closing / broker / destination fees
 * instead of shipping, no warranty except on cars, and the owner's own
 * discount limits (realistic: a few percent, not electronics-style).
 */
type SellerCategory = "land" | "house" | "rental" | "car";
interface SellerTerms extends Omit<MerchantTerms, "costPct"> {
  /** List price as a fraction of the asking price. */
  list: number;
  /** Owner's deepest discount and the store agent's opening discount. */
  maxDiscount: number;
  opening: number;
}

const SELLER_TERMS: Record<SellerCategory, Record<MerchantId, SellerTerms>> = {
  house: {
    atelier: { list: 1.0, maxDiscount: 0.04, opening: 0.01, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 30, expressDeliveryDays: 21, expressCostCents: dollars(1_500), shippingCents: 0 },
    bolt: { list: 0.98, maxDiscount: 0.07, opening: 0.02, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 45, expressDeliveryDays: 30, expressCostCents: dollars(1_200), shippingCents: dollars(3_500) },
    cove: { list: 0.99, maxDiscount: 0.05, opening: 0.015, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 30, expressDeliveryDays: 21, expressCostCents: dollars(1_000), shippingCents: dollars(2_000) },
  },
  land: {
    atelier: { list: 1.0, maxDiscount: 0.06, opening: 0.015, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 21, expressDeliveryDays: 10, expressCostCents: dollars(800), shippingCents: dollars(900) },
    bolt: { list: 0.97, maxDiscount: 0.1, opening: 0.03, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 30, expressDeliveryDays: 14, expressCostCents: dollars(600), shippingCents: dollars(1_500) },
    cove: { list: 0.99, maxDiscount: 0.08, opening: 0.02, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 21, expressDeliveryDays: 14, expressCostCents: dollars(500), shippingCents: dollars(1_000) },
  },
  rental: {
    atelier: { list: 1.0, maxDiscount: 0.04, opening: 0.01, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 7, expressDeliveryDays: 3, expressCostCents: dollars(100), shippingCents: 0 },
    bolt: { list: 0.97, maxDiscount: 0.08, opening: 0.02, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 14, expressDeliveryDays: 5, expressCostCents: dollars(150), shippingCents: dollars(500) },
    cove: { list: 0.99, maxDiscount: 0.06, opening: 0.015, baseWarrantyMonths: 0, maxWarrantyMonths: 0, warrantyCostPct: 0, standardDeliveryDays: 10, expressDeliveryDays: 4, expressCostCents: dollars(120), shippingCents: dollars(250) },
  },
  car: {
    atelier: { list: 1.0, maxDiscount: 0.04, opening: 0.01, baseWarrantyMonths: 48, maxWarrantyMonths: 72, warrantyCostPct: 0.012, standardDeliveryDays: 10, expressDeliveryDays: 5, expressCostCents: dollars(300), shippingCents: 0 },
    bolt: { list: 0.97, maxDiscount: 0.08, opening: 0.02, baseWarrantyMonths: 36, maxWarrantyMonths: 48, warrantyCostPct: 0.015, standardDeliveryDays: 14, expressDeliveryDays: 7, expressCostCents: dollars(250), shippingCents: dollars(1_195) },
    cove: { list: 0.99, maxDiscount: 0.06, opening: 0.015, baseWarrantyMonths: 36, maxWarrantyMonths: 60, warrantyCostPct: 0.01, standardDeliveryDays: 10, expressDeliveryDays: 6, expressCostCents: dollars(200), shippingCents: dollars(995) },
  },
};

/** Every store's agent can represent the owners of these listings (3 similar units each). */
const SELLER_LISTINGS = [
  "land-cedar-grove-plot",
  "land-lakeside-plot",
  "land-hill-country-parcel",
  "house-maple-street",
  "house-east-townhouse",
  "house-cedar-park-garden",
  "rental-downtown-1bed",
  "rental-campus-2bed",
  "rental-pflugerville-house",
  "toyota-camry-2026",
  "honda-crv-hybrid-2026",
  "hyundai-ioniq-5-2026",
];

function buildSellerListing(merchantId: MerchantId, productId: string): Listing {
  const product = getProduct(productId);
  const t = SELLER_TERMS[product.category as SellerCategory][merchantId];
  const listPriceCents = charm(product.msrpCents * t.list);
  const floorPriceCents = Math.round((listPriceCents * (1 - t.maxDiscount)) / 100) * 100;
  return {
    id: `${merchantId}:${product.id}`,
    merchantId,
    productId: product.id,
    listPriceCents,
    floorPriceCents,
    stock: 3,
    baseWarrantyMonths: t.baseWarrantyMonths,
    maxWarrantyMonths: t.maxWarrantyMonths,
    warrantyCostPerYearCents: Math.round((listPriceCents * t.warrantyCostPct) / 100) * 100,
    // The owner's limits bind, not the store's margins.
    costCents: Math.round((floorPriceCents * 0.85) / 100) * 100,
    maxSellingPriceCents: listPriceCents,
    standardDeliveryDays: t.standardDeliveryDays,
    expressDeliveryDays: t.expressDeliveryDays,
    expressCostCents: t.expressCostCents,
    shippingCents: t.shippingCents,
    maxDiscountPct: t.maxDiscount,
    openingDiscountPct: t.opening,
    sellerListing: true,
  };
}

const SEEDS: Record<MerchantId, ListingSeed[]> = {
  // Premium store: Apple-heavy, top-end Windows and Android, at or near list price.
  atelier: [
    { productId: "apple-macbook-air-13", list: 1.0, floor: 0.93, stock: 14 },
    { productId: "apple-macbook-air-15", list: 1.0, floor: 0.93, stock: 9 },
    { productId: "apple-macbook-pro-14", list: 1.0, floor: 0.93, stock: 8 },
    { productId: "apple-macbook-pro-16", list: 1.0, floor: 0.93, stock: 4 },
    { productId: "dell-xps-14", list: 1.0, floor: 0.92, stock: 5 },
    { productId: "lenovo-thinkpad-x1-carbon", list: 1.0, floor: 0.92, stock: 6 },
    { productId: "asus-rog-zephyrus-g14", list: 0.99, floor: 0.92, stock: 3 },
    { productId: "apple-iphone-17", list: 1.0, floor: 0.94, stock: 20 },
    { productId: "apple-iphone-17-pro", list: 1.0, floor: 0.94, stock: 12 },
    { productId: "apple-iphone-17-pro-max", list: 1.0, floor: 0.94, stock: 8 },
    { productId: "samsung-galaxy-s25-ultra", list: 1.0, floor: 0.92, stock: 6 },
    { productId: "google-pixel-10-pro", list: 1.0, floor: 0.92, stock: 6 },
    { productId: "apple-ipad-air-11", list: 1.0, floor: 0.93, stock: 10 },
    { productId: "apple-ipad-pro-11", list: 1.0, floor: 0.93, stock: 5 },
    { productId: "apple-airpods-pro-3", list: 1.0, floor: 0.93, stock: 25 },
    { productId: "apple-airpods-max", list: 1.0, floor: 0.92, stock: 6 },
    { productId: "sony-wh-1000xm6", list: 1.0, floor: 0.9, stock: 12 },
    { productId: "apple-studio-display", list: 1.0, floor: 0.93, stock: 4 },
    { productId: "lg-ultragear-27-oled", list: 1.0, floor: 0.92, stock: 5 },
  ],
  // Competitive store: widest range, lowest list prices, deepest discounts.
  bolt: [
    { productId: "apple-macbook-air-13", list: 0.95, floor: 0.88, stock: 30 },
    { productId: "apple-macbook-pro-14", list: 0.95, floor: 0.88, stock: 10 },
    { productId: "dell-xps-14", list: 0.94, floor: 0.87, stock: 2 },
    { productId: "asus-zenbook-14", list: 0.93, floor: 0.88, stock: 18 },
    { productId: "asus-rog-zephyrus-g14", list: 0.93, floor: 0.88, stock: 4 },
    { productId: "lenovo-legion-5i", list: 0.92, floor: 0.88, stock: 9 },
    { productId: "hp-omnibook-x-14", list: 0.92, floor: 0.88, stock: 12 },
    { productId: "acer-swift-go-14", list: 0.93, floor: 0.88, stock: 25 },
    { productId: "microsoft-surface-laptop-7", list: 0.94, floor: 0.88, stock: 10 },
    { productId: "apple-iphone-17", list: 0.96, floor: 0.9, stock: 40 },
    { productId: "apple-iphone-16e", list: 0.94, floor: 0.89, stock: 30 },
    { productId: "samsung-galaxy-s25", list: 0.92, floor: 0.88, stock: 25 },
    { productId: "samsung-galaxy-s25-ultra", list: 0.93, floor: 0.88, stock: 12 },
    { productId: "samsung-galaxy-a56", list: 0.92, floor: 0.88, stock: 30 },
    { productId: "google-pixel-10", list: 0.93, floor: 0.88, stock: 18 },
    { productId: "apple-ipad-air-11", list: 0.95, floor: 0.89, stock: 15 },
    { productId: "samsung-galaxy-tab-s10-fe", list: 0.92, floor: 0.88, stock: 14 },
    { productId: "apple-airpods-pro-3", list: 0.96, floor: 0.9, stock: 35 },
    { productId: "sony-wh-1000xm6", list: 0.92, floor: 0.88, stock: 20 },
    { productId: "samsung-galaxy-buds3-pro", list: 0.9, floor: 0.88, stock: 25 },
    { productId: "dell-ultrasharp-27-4k", list: 0.92, floor: 0.88, stock: 15 },
    { productId: "lg-ultragear-27-oled", list: 0.92, floor: 0.88, stock: 8 },
  ],
  // Retention store: fair prices plus accessories in the box; Bose exclusive.
  cove: [
    { productId: "apple-macbook-air-13", list: 0.98, floor: 0.9, stock: 12 },
    { productId: "apple-macbook-air-15", list: 0.98, floor: 0.9, stock: 6 },
    { productId: "apple-macbook-pro-14", list: 0.98, floor: 0.9, stock: 6 },
    { productId: "lenovo-thinkpad-x1-carbon", list: 0.97, floor: 0.9, stock: 4 },
    { productId: "asus-zenbook-14", list: 0.98, floor: 0.9, stock: 8 },
    { productId: "lenovo-legion-5i", list: 0.98, floor: 0.9, stock: 5 },
    { productId: "microsoft-surface-laptop-7", list: 0.98, floor: 0.9, stock: 7 },
    { productId: "apple-iphone-17", list: 0.98, floor: 0.91, stock: 15 },
    { productId: "apple-iphone-17-pro", list: 0.98, floor: 0.91, stock: 9 },
    { productId: "samsung-galaxy-s25", list: 0.98, floor: 0.9, stock: 10 },
    { productId: "samsung-galaxy-a56", list: 0.98, floor: 0.9, stock: 12 },
    { productId: "google-pixel-10", list: 0.98, floor: 0.9, stock: 9 },
    { productId: "google-pixel-10-pro", list: 0.98, floor: 0.9, stock: 5 },
    { productId: "apple-ipad-air-11", list: 0.98, floor: 0.9, stock: 9 },
    { productId: "samsung-galaxy-tab-s10-fe", list: 0.98, floor: 0.9, stock: 12 },
    { productId: "apple-airpods-pro-3", list: 0.98, floor: 0.91, stock: 18 },
    // Clearance: overstock bought cheaply. Up to 50% off; the store opens at 20%.
    { productId: "bose-quietcomfort-ultra", list: 0.98, floor: 0.5, stock: 10, clearance: { cost: 0.45, maxDiscount: 0.5, opening: 0.2 } },
    { productId: "samsung-galaxy-buds3-pro", list: 0.98, floor: 0.9, stock: 14 },
    { productId: "dell-ultrasharp-27-4k", list: 0.98, floor: 0.9, stock: 7 },
    { productId: "apple-studio-display", list: 0.98, floor: 0.91, stock: 3 },
  ],
};

function buildListing(merchantId: MerchantId, seed: ListingSeed): Listing {
  const product = getProduct(seed.productId);
  const terms = MERCHANT_TERMS[merchantId];
  const listPriceCents = charm(product.msrpCents * seed.list);
  const floorPriceCents = Math.round((listPriceCents * seed.floor) / 100) * 100;
  return {
    id: `${merchantId}:${product.id}`,
    merchantId,
    productId: product.id,
    listPriceCents,
    floorPriceCents,
    stock: seed.stock,
    baseWarrantyMonths: terms.baseWarrantyMonths,
    maxWarrantyMonths: terms.maxWarrantyMonths,
    warrantyCostPerYearCents: Math.round((listPriceCents * terms.warrantyCostPct) / 100) * 100,
    costCents: Math.round((listPriceCents * (seed.clearance?.cost ?? terms.costPct)) / 100) * 100,
    maxSellingPriceCents: listPriceCents,
    standardDeliveryDays: terms.standardDeliveryDays,
    expressDeliveryDays: terms.expressDeliveryDays,
    expressCostCents: terms.expressCostCents,
    // Small accessories ship free everywhere.
    shippingCents: product.msrpCents < dollars(300) ? 0 : terms.shippingCents,
    maxDiscountPct: seed.clearance?.maxDiscount ?? null,
    openingDiscountPct: seed.clearance?.opening ?? null,
  };
}

const INITIAL_LISTINGS: Listing[] = (Object.keys(SEEDS) as MerchantId[]).flatMap((m) => [
  ...SEEDS[m].map((seed) => buildListing(m, seed)),
  ...SELLER_LISTINGS.map((id) => buildSellerListing(m, id)),
]);

/** Fresh copy of the seed inventory (stock is mutable per process). */
export function seedListings(): Listing[] {
  return INITIAL_LISTINGS.map((l) => ({ ...l }));
}


export interface PublicListing {
  merchantId: MerchantId;
  productId: string;
  listPriceCents: number;
  shippingCents: number;
  stock: number;
  baseWarrantyMonths: number;
  standardDeliveryDays: number;
}

/** Listing fields that are safe to show shoppers (no floors or costs). */
export function toPublicListing(l: Listing): PublicListing {
  return {
    merchantId: l.merchantId,
    productId: l.productId,
    listPriceCents: l.listPriceCents,
    shippingCents: l.shippingCents,
    stock: l.stock,
    baseWarrantyMonths: l.baseWarrantyMonths,
    standardDeliveryDays: l.standardDeliveryDays,
  };
}
