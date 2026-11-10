import { dollars } from "./money";
import type { Category, Product, PurchaseIntent, UseCase } from "./types";

/**
 * Demo catalogue of real, well-known products. Specs and prices are close to
 * public list prices but are approximate demo values; the three stores
 * selling them are simulated. No brand logos or product photos are bundled.
 */
export const PRODUCTS: Product[] = [
  // ---------------- Laptops
  {
    id: "apple-macbook-air-13",
    name: "MacBook Air 13 (M4)",
    brand: "Apple",
    family: "MacBook Air",
    aliases: ["macbook air 13", "13-inch macbook air", "13 inch macbook air", "macbook air m4"],
    category: "laptop",
    description: "Apple’s thin and light 13-inch laptop with all-day battery.",
    specs: { cpu: "Apple M4 · 10-core", ramGb: 16, storageGb: 256, gpu: "10-core GPU", dedicatedGpu: false, displayIn: 13.6, display: "Liquid Retina", weightKg: 1.24, batteryHours: 18 },
    suitedFor: ["student", "travel", "business", "programming", "general"],
    msrpCents: dollars(999),
    hue: 220,
  },
  {
    id: "apple-macbook-air-15",
    name: "MacBook Air 15 (M4)",
    brand: "Apple",
    family: "MacBook Air",
    aliases: ["macbook air 15", "15-inch macbook air", "15 inch macbook air"],
    category: "laptop",
    description: "The bigger-screen MacBook Air, still light enough to carry all day.",
    specs: { cpu: "Apple M4 · 10-core", ramGb: 16, storageGb: 256, gpu: "10-core GPU", dedicatedGpu: false, displayIn: 15.3, display: "Liquid Retina", weightKg: 1.51, batteryHours: 18 },
    suitedFor: ["student", "business", "general", "creative"],
    msrpCents: dollars(1199),
    hue: 225,
  },
  {
    id: "apple-macbook-pro-14",
    name: "MacBook Pro 14 (M5)",
    brand: "Apple",
    family: "MacBook Pro",
    aliases: ["macbook pro 14", "14-inch macbook pro", "14 inch macbook pro", "macbook pro m5"],
    category: "laptop",
    description: "Pro laptop with a Liquid Retina XDR display for editing and development.",
    specs: { cpu: "Apple M5 · 10-core", ramGb: 16, storageGb: 512, gpu: "10-core GPU", dedicatedGpu: false, displayIn: 14.2, display: "Liquid Retina XDR", weightKg: 1.55, batteryHours: 24 },
    suitedFor: ["video-editing", "creative", "programming", "business"],
    msrpCents: dollars(1599),
    hue: 230,
  },
  {
    id: "apple-macbook-pro-16",
    name: "MacBook Pro 16 (M4 Pro)",
    brand: "Apple",
    family: "MacBook Pro",
    aliases: ["macbook pro 16", "16-inch macbook pro", "16 inch macbook pro", "macbook pro m4 pro"],
    category: "laptop",
    description: "Apple’s largest pro laptop for heavy video and 3D work.",
    specs: { cpu: "Apple M4 Pro · 14-core", ramGb: 24, storageGb: 512, gpu: "20-core GPU", dedicatedGpu: false, displayIn: 16.2, display: "Liquid Retina XDR", weightKg: 2.14, batteryHours: 24 },
    suitedFor: ["video-editing", "creative", "programming"],
    msrpCents: dollars(2499),
    hue: 235,
  },
  {
    id: "dell-xps-14",
    name: "Dell XPS 14",
    brand: "Dell",
    family: "XPS",
    aliases: ["dell xps 14", "xps 14"],
    category: "laptop",
    description: "Premium 14.5-inch OLED laptop with NVIDIA graphics.",
    specs: { cpu: "Intel Core Ultra 7", ramGb: 32, storageGb: 1024, gpu: "NVIDIA GeForce RTX 4050 6GB", dedicatedGpu: true, displayIn: 14.5, display: "3.2K OLED 120Hz", weightKg: 1.68, batteryHours: 12 },
    suitedFor: ["video-editing", "creative", "programming", "business"],
    msrpCents: dollars(1699),
    hue: 205,
  },
  {
    id: "lenovo-thinkpad-x1-carbon",
    name: "Lenovo ThinkPad X1 Carbon Gen 13",
    brand: "Lenovo",
    family: "ThinkPad",
    aliases: ["thinkpad x1 carbon", "x1 carbon"],
    category: "laptop",
    description: "Under-1kg business laptop with a famous keyboard.",
    specs: { cpu: "Intel Core Ultra 7", ramGb: 32, storageGb: 1024, gpu: "Integrated", dedicatedGpu: false, displayIn: 14, display: "2.8K OLED", weightKg: 0.99, batteryHours: 15 },
    suitedFor: ["business", "travel", "programming"],
    msrpCents: dollars(1899),
    hue: 0,
  },
  {
    id: "lenovo-legion-5i",
    name: "Lenovo Legion 5i",
    brand: "Lenovo",
    family: "Legion",
    aliases: ["legion 5i", "legion 5"],
    category: "laptop",
    description: "15-inch gaming laptop with an OLED 165Hz screen.",
    specs: { cpu: "Intel Core i7", ramGb: 16, storageGb: 1024, gpu: "NVIDIA GeForce RTX 5060 8GB", dedicatedGpu: true, displayIn: 15.1, display: "OLED 165Hz", weightKg: 1.95, batteryHours: 7, refreshHz: 165 },
    suitedFor: ["gaming", "student", "programming"],
    msrpCents: dollars(1399),
    hue: 10,
  },
  {
    id: "asus-rog-zephyrus-g14",
    name: "ASUS ROG Zephyrus G14",
    brand: "ASUS",
    family: "ROG",
    aliases: ["rog zephyrus g14", "zephyrus g14", "rog g14"],
    category: "laptop",
    description: "Compact 14-inch gaming and creator laptop with RTX graphics.",
    specs: { cpu: "AMD Ryzen AI 9 HX 370", ramGb: 32, storageGb: 1024, gpu: "NVIDIA GeForce RTX 5070 8GB", dedicatedGpu: true, displayIn: 14, display: "3K OLED 120Hz", weightKg: 1.5, batteryHours: 10, refreshHz: 120 },
    suitedFor: ["gaming", "video-editing", "creative"],
    msrpCents: dollars(1999),
    hue: 350,
  },
  {
    id: "asus-zenbook-14",
    name: "ASUS Zenbook 14 OLED",
    brand: "ASUS",
    family: "Zenbook",
    aliases: ["zenbook 14", "zenbook 14 oled"],
    category: "laptop",
    description: "Light everyday laptop with a sharp OLED screen.",
    specs: { cpu: "Intel Core Ultra 7", ramGb: 16, storageGb: 1024, gpu: "Integrated", dedicatedGpu: false, displayIn: 14, display: "3K OLED 120Hz", weightKg: 1.2, batteryHours: 15 },
    suitedFor: ["student", "programming", "travel", "general"],
    msrpCents: dollars(899),
    hue: 210,
  },
  {
    id: "hp-omnibook-x-14",
    name: "HP OmniBook X 14",
    brand: "HP",
    family: "OmniBook",
    aliases: ["omnibook x 14", "omnibook x"],
    category: "laptop",
    description: "Snapdragon-powered laptop with very long battery life.",
    specs: { cpu: "Snapdragon X Elite", ramGb: 16, storageGb: 512, gpu: "Integrated", dedicatedGpu: false, displayIn: 14, display: "2.2K IPS", weightKg: 1.34, batteryHours: 22 },
    suitedFor: ["business", "travel", "student", "general"],
    msrpCents: dollars(1099),
    hue: 200,
  },
  {
    id: "microsoft-surface-laptop-7",
    name: "Microsoft Surface Laptop (7th Edition)",
    brand: "Microsoft",
    family: "Surface",
    aliases: ["surface laptop 7", "surface laptop"],
    category: "laptop",
    description: "13.8-inch Copilot+ PC with a 120Hz touchscreen.",
    specs: { cpu: "Snapdragon X Plus", ramGb: 16, storageGb: 512, gpu: "Integrated", dedicatedGpu: false, displayIn: 13.8, display: "PixelSense 120Hz touch", weightKg: 1.34, batteryHours: 20 },
    suitedFor: ["business", "student", "travel", "general"],
    msrpCents: dollars(999),
    hue: 195,
  },
  {
    id: "acer-swift-go-14",
    name: "Acer Swift Go 14",
    brand: "Acer",
    family: "Swift",
    aliases: ["swift go 14", "acer swift"],
    category: "laptop",
    description: "Affordable OLED laptop for study and everyday work.",
    specs: { cpu: "Intel Core Ultra 5", ramGb: 16, storageGb: 512, gpu: "Integrated", dedicatedGpu: false, displayIn: 14, display: "2.8K OLED", weightKg: 1.3, batteryHours: 13 },
    suitedFor: ["student", "general", "travel"],
    msrpCents: dollars(749),
    hue: 95,
  },
  // ---------------- Smartphones
  {
    id: "apple-iphone-17",
    name: "iPhone 17",
    brand: "Apple",
    family: "iPhone",
    aliases: ["iphone 17"],
    category: "phone",
    description: "Apple’s everyday iPhone with a 120Hz display and 256GB to start.",
    specs: { ramGb: 8, storageGb: 256, displayIn: 6.3, display: "Super Retina XDR 120Hz", camera: "48MP dual", batteryHours: 30, weightKg: 0.177 },
    suitedFor: ["general", "creative", "business", "travel"],
    msrpCents: dollars(799),
    hue: 260,
  },
  {
    id: "apple-iphone-17-pro",
    name: "iPhone 17 Pro",
    brand: "Apple",
    family: "iPhone",
    aliases: ["iphone 17 pro"],
    category: "phone",
    description: "Pro iPhone with a triple 48MP camera system.",
    specs: { ramGb: 12, storageGb: 256, displayIn: 6.3, display: "Super Retina XDR 120Hz", camera: "48MP triple", batteryHours: 33, weightKg: 0.204 },
    suitedFor: ["creative", "video-editing", "business", "general"],
    msrpCents: dollars(1099),
    hue: 30,
  },
  {
    id: "apple-iphone-17-pro-max",
    name: "iPhone 17 Pro Max",
    brand: "Apple",
    family: "iPhone",
    aliases: ["iphone 17 pro max"],
    category: "phone",
    description: "The biggest iPhone, with the longest battery life.",
    specs: { ramGb: 12, storageGb: 256, displayIn: 6.9, display: "Super Retina XDR 120Hz", camera: "48MP triple", batteryHours: 37, weightKg: 0.233 },
    suitedFor: ["creative", "video-editing", "travel"],
    msrpCents: dollars(1199),
    hue: 25,
  },
  {
    id: "apple-iphone-16e",
    name: "iPhone 16e",
    brand: "Apple",
    family: "iPhone",
    aliases: ["iphone 16e"],
    category: "phone",
    description: "The most affordable current iPhone.",
    specs: { ramGb: 8, storageGb: 128, displayIn: 6.1, display: "Super Retina XDR", camera: "48MP", batteryHours: 26, weightKg: 0.167 },
    suitedFor: ["student", "general"],
    msrpCents: dollars(599),
    hue: 240,
  },
  {
    id: "samsung-galaxy-s25-ultra",
    name: "Samsung Galaxy S25 Ultra",
    brand: "Samsung",
    family: "Galaxy",
    aliases: ["galaxy s25 ultra", "s25 ultra"],
    category: "phone",
    description: "Samsung’s top phone with a built-in S Pen and 200MP camera.",
    specs: { ramGb: 12, storageGb: 256, displayIn: 6.9, display: "Dynamic AMOLED 120Hz", camera: "200MP quad", batteryHours: 31, weightKg: 0.218 },
    suitedFor: ["creative", "business", "gaming"],
    msrpCents: dollars(1299),
    hue: 225,
  },
  {
    id: "samsung-galaxy-s25",
    name: "Samsung Galaxy S25",
    brand: "Samsung",
    family: "Galaxy",
    aliases: ["galaxy s25", "s25"],
    category: "phone",
    description: "Compact Galaxy flagship with Galaxy AI features.",
    specs: { ramGb: 12, storageGb: 128, displayIn: 6.2, display: "Dynamic AMOLED 120Hz", camera: "50MP triple", batteryHours: 29, weightKg: 0.162 },
    suitedFor: ["general", "student", "business"],
    msrpCents: dollars(799),
    hue: 215,
  },
  {
    id: "samsung-galaxy-a56",
    name: "Samsung Galaxy A56",
    brand: "Samsung",
    family: "Galaxy",
    aliases: ["galaxy a56", "a56"],
    category: "phone",
    description: "Good-value Galaxy with a big screen and long software support.",
    specs: { ramGb: 8, storageGb: 128, displayIn: 6.7, display: "Super AMOLED 120Hz", camera: "50MP triple", batteryHours: 29, weightKg: 0.198 },
    suitedFor: ["student", "general"],
    msrpCents: dollars(499),
    hue: 200,
  },
  {
    id: "google-pixel-10",
    name: "Google Pixel 10",
    brand: "Google",
    family: "Pixel",
    aliases: ["pixel 10"],
    category: "phone",
    description: "Google’s phone with clean Android and great everyday photos.",
    specs: { ramGb: 12, storageGb: 128, displayIn: 6.3, display: "Actua OLED 120Hz", camera: "48MP triple", batteryHours: 30, weightKg: 0.204 },
    suitedFor: ["general", "student", "creative"],
    msrpCents: dollars(799),
    hue: 150,
  },
  {
    id: "google-pixel-10-pro",
    name: "Google Pixel 10 Pro",
    brand: "Google",
    family: "Pixel",
    aliases: ["pixel 10 pro"],
    category: "phone",
    description: "Pixel with a pro camera, telephoto zoom and 16GB memory.",
    specs: { ramGb: 16, storageGb: 128, displayIn: 6.3, display: "Super Actua OLED 120Hz", camera: "50MP triple", batteryHours: 30, weightKg: 0.207 },
    suitedFor: ["creative", "business", "general"],
    msrpCents: dollars(999),
    hue: 160,
  },
  // ---------------- Tablets
  {
    id: "apple-ipad-air-11",
    name: "iPad Air 11 (M3)",
    brand: "Apple",
    family: "iPad",
    aliases: ["ipad air 11", "ipad air"],
    category: "tablet",
    description: "Light, powerful iPad for notes, study and drawing.",
    specs: { ramGb: 8, storageGb: 128, displayIn: 11, display: "Liquid Retina", weightKg: 0.46, batteryHours: 10 },
    suitedFor: ["student", "creative", "travel"],
    msrpCents: dollars(599),
    hue: 270,
  },
  {
    id: "apple-ipad-pro-11",
    name: "iPad Pro 11 (M5)",
    brand: "Apple",
    family: "iPad",
    aliases: ["ipad pro 11", "ipad pro"],
    category: "tablet",
    description: "Thinnest, fastest iPad with a tandem OLED display.",
    specs: { ramGb: 12, storageGb: 256, displayIn: 11, display: "Ultra Retina XDR 120Hz", weightKg: 0.44, batteryHours: 10 },
    suitedFor: ["creative", "video-editing"],
    msrpCents: dollars(999),
    hue: 280,
  },
  {
    id: "samsung-galaxy-tab-s10-fe",
    name: "Samsung Galaxy Tab S10 FE",
    brand: "Samsung",
    family: "Galaxy",
    aliases: ["galaxy tab s10 fe", "tab s10 fe", "galaxy tab"],
    category: "tablet",
    description: "Affordable Android tablet with an S Pen in the box.",
    specs: { ramGb: 8, storageGb: 128, displayIn: 10.9, display: "LCD 90Hz", weightKg: 0.5, batteryHours: 12 },
    suitedFor: ["student", "general"],
    msrpCents: dollars(499),
    hue: 205,
  },
  // ---------------- Headphones
  {
    id: "apple-airpods-pro-3",
    name: "AirPods Pro 3",
    brand: "Apple",
    family: "AirPods",
    aliases: ["airpods pro 3", "airpods pro"],
    category: "headphones",
    description: "Apple’s noise-cancelling earbuds with heart-rate sensing.",
    specs: { noiseCancelling: true, batteryHours: 8, weightKg: 0.05 },
    suitedFor: ["travel", "general", "student"],
    msrpCents: dollars(249),
    hue: 250,
  },
  {
    id: "apple-airpods-max",
    name: "AirPods Max",
    brand: "Apple",
    family: "AirPods",
    aliases: ["airpods max"],
    category: "headphones",
    description: "Apple’s over-ear headphones with active noise cancellation.",
    specs: { noiseCancelling: true, batteryHours: 20, weightKg: 0.385 },
    suitedFor: ["creative", "travel", "general"],
    msrpCents: dollars(549),
    hue: 255,
  },
  {
    id: "sony-wh-1000xm6",
    name: "Sony WH-1000XM6",
    brand: "Sony",
    family: "1000X",
    aliases: ["wh-1000xm6", "1000xm6", "xm6"],
    category: "headphones",
    description: "Sony’s flagship noise-cancelling over-ear headphones.",
    specs: { noiseCancelling: true, batteryHours: 30, weightKg: 0.254 },
    suitedFor: ["travel", "business", "general"],
    msrpCents: dollars(449),
    hue: 40,
  },
  {
    id: "bose-quietcomfort-ultra",
    name: "Bose QuietComfort Ultra Headphones",
    brand: "Bose",
    family: "QuietComfort",
    aliases: ["quietcomfort ultra", "qc ultra"],
    category: "headphones",
    description: "Bose’s most comfortable noise-cancelling headphones.",
    specs: { noiseCancelling: true, batteryHours: 24, weightKg: 0.25 },
    suitedFor: ["travel", "business"],
    msrpCents: dollars(429),
    hue: 45,
  },
  {
    id: "samsung-galaxy-buds3-pro",
    name: "Samsung Galaxy Buds3 Pro",
    brand: "Samsung",
    family: "Galaxy",
    aliases: ["galaxy buds3 pro", "galaxy buds 3 pro", "buds3 pro", "galaxy buds"],
    category: "headphones",
    description: "Noise-cancelling earbuds that pair best with Galaxy phones.",
    specs: { noiseCancelling: true, batteryHours: 6, weightKg: 0.05 },
    suitedFor: ["general", "travel"],
    msrpCents: dollars(249),
    hue: 210,
  },
  // ---------------- Monitors
  {
    id: "apple-studio-display",
    name: "Apple Studio Display",
    brand: "Apple",
    family: "Studio Display",
    aliases: ["studio display"],
    category: "monitor",
    description: "27-inch 5K Retina display with a built-in camera and speakers.",
    specs: { displayIn: 27, display: "5K Retina", refreshHz: 60 },
    suitedFor: ["creative", "video-editing", "business"],
    msrpCents: dollars(1599),
    hue: 225,
  },
  {
    id: "dell-ultrasharp-27-4k",
    name: "Dell UltraSharp 27 4K",
    brand: "Dell",
    family: "UltraSharp",
    aliases: ["ultrasharp 27", "dell ultrasharp"],
    category: "monitor",
    description: "Colour-accurate 27-inch 4K monitor with USB-C hub.",
    specs: { displayIn: 27, display: "4K IPS Black 120Hz", refreshHz: 120 },
    suitedFor: ["programming", "business", "creative"],
    msrpCents: dollars(699),
    hue: 205,
  },
  {
    id: "lg-ultragear-27-oled",
    name: "LG UltraGear 27 OLED",
    brand: "LG",
    family: "UltraGear",
    aliases: ["ultragear 27", "lg ultragear"],
    category: "monitor",
    description: "Fast 27-inch OLED gaming monitor at 240Hz.",
    specs: { displayIn: 27, display: "QHD OLED 240Hz", refreshHz: 240 },
    suitedFor: ["gaming", "creative"],
    msrpCents: dollars(899),
    hue: 330,
  },
];

const PRODUCT_INDEX = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): Product {
  const p = PRODUCT_INDEX.get(id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return p;
}

export function findProduct(id: string): Product | undefined {
  return PRODUCT_INDEX.get(id);
}

export function meetsRequirements(product: Product, intent: PurchaseIntent): { ok: boolean; misses: string[] } {
  const misses: string[] = [];
  if (product.category !== intent.category) misses.push(`not a ${intent.category}`);
  if (intent.targetProductId && product.id !== intent.targetProductId) misses.push("not the requested model");
  if (intent.requiredBrand && product.brand !== intent.requiredBrand) misses.push(`not ${intent.requiredBrand}`);
  if (intent.requiredFamily && product.family !== intent.requiredFamily) misses.push(`not a ${intent.requiredFamily}`);
  const s = product.specs;
  if (intent.minRamGb && (s.ramGb ?? 0) < intent.minRamGb) misses.push(`${s.ramGb ?? 0}GB RAM < ${intent.minRamGb}GB`);
  if (intent.minStorageGb && (s.storageGb ?? 0) < intent.minStorageGb) misses.push(`${s.storageGb ?? 0}GB storage < ${intent.minStorageGb}GB`);
  if (intent.needsDedicatedGpu && !s.dedicatedGpu) misses.push("no dedicated GPU");
  if (intent.maxWeightKg && (s.weightKg ?? 99) > intent.maxWeightKg) misses.push(`${s.weightKg}kg > ${intent.maxWeightKg}kg`);
  return { ok: misses.length === 0, misses };
}

/** 0–1 suitability of a product for the buyer's stated purpose. */
export function fitScore(product: Product, intent: PurchaseIntent): number {
  if (product.category !== intent.category) return 0;
  let score = 0.45;
  const use: UseCase | null = intent.useCase;
  if (use && product.suitedFor.includes(use)) score += 0.3;
  else if (!use || use === "general") score += 0.15;
  const s = product.specs;
  if (intent.minRamGb && s.ramGb) score += Math.min(0.08, ((s.ramGb - intent.minRamGb) / intent.minRamGb) * 0.08);
  if ((use === "gaming" || use === "video-editing") && s.dedicatedGpu) score += 0.1;
  if (use === "travel" && s.weightKg) score += s.weightKg < 1.4 ? 0.08 : s.weightKg < 1.8 ? 0.03 : -0.05;
  if (intent.preferredBrands.some((b) => b.toLowerCase() === product.brand.toLowerCase())) score += 0.12;
  return Math.max(0, Math.min(1, score));
}

export const CATEGORY_LABEL: Record<Category, string> = {
  laptop: "Laptop",
  monitor: "Monitor",
  headphones: "Headphones",
  tablet: "Tablet",
  phone: "Smartphone",
};

export function specLine(product: Product): string {
  const s = product.specs;
  const parts: string[] = [];
  if (s.cpu) parts.push(s.cpu);
  if (s.ramGb) parts.push(`${s.ramGb}GB RAM`);
  if (s.camera) parts.push(`${s.camera} camera`);
  if (s.storageGb) parts.push(s.storageGb >= 1024 ? `${s.storageGb / 1024}TB` : `${s.storageGb}GB`);
  if (s.gpu && s.dedicatedGpu) parts.push(s.gpu);
  if (s.display) parts.push(s.display);
  if (s.noiseCancelling) parts.push("Active noise cancelling");
  if (s.batteryHours && product.category === "headphones") parts.push(`${s.batteryHours}h battery`);
  if (s.weightKg && product.category === "laptop") parts.push(`${s.weightKg}kg`);
  return parts.join(" · ");
}
