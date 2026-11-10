import { CATEGORY_LABEL, PRODUCTS } from "./catalog";
import { formatMoney } from "./money";
import type { Category, Priority, PurchaseIntent, UseCase } from "./types";

export interface IntentParse {
  intent: PurchaseIntent | null;
  /** What the buyer agent still needs before negotiating. */
  missing: Array<"category">;
}

const CATEGORY_PATTERNS: Array<[Category, RegExp]> = [
  ["laptop", /\b(laptops?|notebooks?|ultrabooks?|macbooks?|chromebooks?)\b/i],
  ["phone", /\b(smart ?phones?|phones?|mobiles?|iphones?|androids?|handsets?)\b/i],
  ["tablet", /\b(tablets?|ipads?|slates?)\b/i],
  ["headphones", /\b(headphones?|earbuds?|headsets?|earphones?|buds|cans)\b/i],
  ["monitor", /\b(monitors?|displays?|screens?)\b/i],
];

const USE_CASE_PATTERNS: Array<[UseCase, RegExp]> = [
  ["video-editing", /\b(video[- ]?edit\w*|edit(ing)? videos?|premiere|davinci|final cut|youtube|4k video|colou?r grading)\b/i],
  ["gaming", /\b(gam(e|es|ing|er)|esports|fps)\b/i],
  ["programming", /\b(cod(e|ing)|programm\w*|developer|software|engineering|devops)\b/i],
  ["creative", /\b(design\w*|photo\w*|creative|illustrat\w*|drawing|art|music production|mixing)\b/i],
  ["student", /\b(student|school|college|university|uni|study|studying|homework|class(es)?)\b/i],
  ["business", /\b(business|office|work|meetings?|spreadsheets?|excel|consult\w*)\b/i],
  ["travel", /\b(travel\w*|commut\w*|flights?|on the go|portable)\b/i],
];

const PRIORITY_PATTERNS: Array<[Priority, RegExp]> = [
  ["price", /\b(cheapest|lowest price|best price|cheap|affordable|save money|bargain|lowest total)\b/i],
  ["delivery", /\b(fast(est)? (delivery|shipping)|quick(ly)?|asap|urgent(ly)?|tomorrow|next[- ]day|overnight|express|this week)\b/i],
  ["warranty", /\b(warranty|coverage|protection plan|peace of mind|reliab\w*)\b/i],
  ["value", /\b(best value|bundles?|accessories|extras|freebies|value for money)\b/i],
];

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Brand names shoppers use (MacBook implies Apple even without a model line). */
const BRAND_WORDS: Array<[string, RegExp]> = [
  ["Apple", /\bapple\b|\bmac ?books?\b/i],
  ["Samsung", /\bsamsung\b/i],
  ["Google", /\bgoogle\b/i],
  ["Dell", /\bdell\b/i],
  ["Lenovo", /\blenovo\b/i],
  ["ASUS", /\basus\b/i],
  ["HP", /\bhp\b/i],
  ["Microsoft", /\bmicrosoft\b/i],
  ["Acer", /\bacer\b/i],
  ["Sony", /\bsony\b/i],
  ["Bose", /\bbose\b/i],
  ["LG", /\blg\b/i],
];

/** Product lines shoppers name directly, with the brand and category they imply. First match wins. */
const FAMILIES: Array<{ family: string; brand: string; category: Category; re: RegExp }> = [
  { family: "MacBook Air", brand: "Apple", category: "laptop", re: /\bmac ?book air\b/i },
  { family: "MacBook Pro", brand: "Apple", category: "laptop", re: /\bmac ?book pro\b/i },
  { family: "iPhone", brand: "Apple", category: "phone", re: /\biphones?\b/i },
  { family: "iPad", brand: "Apple", category: "tablet", re: /\bipads?\b/i },
  { family: "AirPods", brand: "Apple", category: "headphones", re: /\bair ?pods\b/i },
  { family: "Studio Display", brand: "Apple", category: "monitor", re: /\bstudio display\b/i },
  { family: "Galaxy", brand: "Samsung", category: "tablet", re: /\bgalaxy tab(let)?s?\b/i },
  { family: "Galaxy", brand: "Samsung", category: "headphones", re: /\bgalaxy buds\b/i },
  { family: "Galaxy", brand: "Samsung", category: "phone", re: /\bgalaxy\b/i },
  { family: "Pixel", brand: "Google", category: "phone", re: /\bpixel\b/i },
  { family: "ThinkPad", brand: "Lenovo", category: "laptop", re: /\bthink ?pad\b/i },
  { family: "Legion", brand: "Lenovo", category: "laptop", re: /\blegion\b/i },
  { family: "XPS", brand: "Dell", category: "laptop", re: /\bxps\b/i },
  { family: "UltraSharp", brand: "Dell", category: "monitor", re: /\bultra ?sharp\b/i },
  { family: "ROG", brand: "ASUS", category: "laptop", re: /\brog\b|\bzephyrus\b/i },
  { family: "Zenbook", brand: "ASUS", category: "laptop", re: /\bzen ?book\b/i },
  { family: "Surface", brand: "Microsoft", category: "laptop", re: /\bsurface\b/i },
  { family: "OmniBook", brand: "HP", category: "laptop", re: /\bomni ?book\b/i },
  { family: "Swift", brand: "Acer", category: "laptop", re: /\bacer swift\b|\bswift go\b/i },
  { family: "QuietComfort", brand: "Bose", category: "headphones", re: /\bquiet ?comfort\b|\bqc ?ultra\b/i },
  { family: "UltraGear", brand: "LG", category: "monitor", re: /\bultra ?gear\b/i },
  { family: "1000X", brand: "Sony", category: "headphones", re: /\b(wh-?)?1000 ?xm\d\b|\bxm6\b/i },
];

/** Words that turn a named brand into a preference rather than a requirement. */
const SOFT_BRAND = /\b(prefer(ably|red)?|ideally|maybe|or similar|something like|if possible)\b/i;

export function detectFamily(text: string) {
  return FAMILIES.find((f) => f.re.test(text)) ?? null;
}

export function detectBrands(text: string): string[] {
  return BRAND_WORDS.filter(([, re]) => re.test(text)).map(([b]) => b);
}

/** "Apple laptop", "MacBook Pro", "Samsung Galaxy smartphone", or the exact model. */
export function requestHead(i: Pick<PurchaseIntent, "category" | "targetProductId" | "requiredBrand" | "requiredFamily">): string {
  const model = i.targetProductId ? PRODUCTS.find((p) => p.id === i.targetProductId)?.name : null;
  if (model) return model;
  const cat = CATEGORY_LABEL[i.category].toLowerCase();
  if (i.requiredFamily) return i.requiredBrand === "Apple" ? i.requiredFamily : `${i.requiredBrand} ${i.requiredFamily} ${cat}`;
  if (i.requiredBrand) return `${i.requiredBrand} ${cat}`;
  return CATEGORY_LABEL[i.category];
}

function parseAmount(raw: string, k?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Math.round((k ? n * 1000 : n) * 100);
}

export function extractBudget(text: string): number | null {
  const keyword =
    /\b(?:under|below|less than|max(?:imum)?|up to|budget(?:\s+(?:of|is))?|within|no more than|cap(?:ped)? at|around|about|at most|spend(?:ing)?)\s*(?:~|of)?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b(?!\s*(?:gb|tb|kg|hz|inch|"|months?|years?|days?|%|percent))/i;
  const m = keyword.exec(text);
  if (m) {
    const cents = parseAmount(m[1], m[2]);
    const fuzzy = /\b(around|about)\b/i.test(m[0]);
    return fuzzy ? Math.round(cents * 1.05) : cents;
  }
  const dollar = /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i.exec(text);
  if (dollar) return parseAmount(dollar[1], dollar[2]);
  const bare = /\b(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:dollars|usd|bucks)\b/i.exec(text);
  if (bare) return parseAmount(bare[1], bare[2]);
  return null;
}

/** "30% off", "30 percent discount", "a discount of 30%" → 0.3 (1–90% only). */
export function extractAskDiscount(text: string): number | null {
  const m =
    /\b(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)\s*(?:off|discount)/i.exec(text) ??
    /\bdiscount\s+(?:of\s+)?(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)/i.exec(text);
  if (!m) return null;
  const pct = Number(m[1]);
  return pct >= 1 && pct <= 90 ? pct / 100 : null;
}

export function detectCategory(text: string): Category | null {
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(text)) return cat;
  return null;
}

function detectUseCase(text: string): UseCase | null {
  for (const [use, re] of USE_CASE_PATTERNS) if (re.test(text)) return use;
  return null;
}

function detectPriority(text: string): Priority | null {
  for (const [p, re] of PRIORITY_PATTERNS) if (re.test(text)) return p;
  return null;
}

function detectQuantity(text: string): number | null {
  const m = /\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:x\s+)?(laptops|notebooks|monitors|headphones|pairs|tablets|phones|smartphones|units|sets)\b/i.exec(text);
  if (!m) return null;
  const v = /\d/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1].toLowerCase()];
  return v && v > 0 && v <= 20 ? v : null;
}

/**
 * Deterministic intent extraction. Used as the fallback when Gemini is not
 * configured, and as a cross-check on Gemini output.
 */
const MODEL_NAMES = PRODUCTS.flatMap((p) => [p.name.toLowerCase(), ...p.aliases].map((n) => ({ n, p }))).sort((a, b) => b.n.length - a.n.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Exact model named in the text, matching the longest name or alias first. */
export function detectProduct(text: string) {
  const t = text.toLowerCase();
  return MODEL_NAMES.find(({ n }) => new RegExp(`(^|[^a-z0-9])${escapeRe(n)}($|[^a-z0-9])`).test(t))?.p ?? null;
}

export function parseIntentRules(text: string, base?: PurchaseIntent | null): IntentParse {
  const t = text.trim();
  const named = detectProduct(t);
  const family = named ? null : detectFamily(t);
  const category = named?.category ?? family?.category ?? detectCategory(t) ?? base?.category ?? null;
  if (!category) return { intent: null, missing: ["category"] };

  const switchedCategory = base && base.category !== category;
  const prev = switchedCategory ? null : base;

  // Brand and model line: a single named brand or line is a must-have,
  // unless the shopper softens it ("ideally Dell or Lenovo").
  const brands = detectBrands(t);
  const soft = SOFT_BRAND.test(t);
  let requiredBrand: string | null = prev?.requiredBrand ?? null;
  let requiredFamily: string | null = prev?.requiredFamily ?? null;
  if (named) {
    requiredBrand = null;
    requiredFamily = null;
  } else if (family && !soft) {
    requiredBrand = family.brand;
    requiredFamily = family.family;
  } else if (brands.length === 1 && !soft) {
    requiredBrand = brands[0];
    if (requiredFamily && prev?.requiredBrand !== brands[0]) requiredFamily = null;
  } else if (brands.length > 1 || soft) {
    requiredBrand = null;
    requiredFamily = null;
  }

  const ram = /(\d{1,3})\s*gb\s*(?:of\s*)?(?:ram|memory|unified memory)/i.exec(t) ?? /(?:ram|memory)\s*(?:of\s*)?(\d{1,3})\s*gb/i.exec(t);
  const storage =
    /(\d+(?:\.\d+)?)\s*(tb|gb)\s*(?:of\s*)?(?:ssd|storage|drive|disk|nvme)/i.exec(t) ?? /\b(\d(?:\.\d+)?)\s*(tb)\b/i.exec(t);
  const weight = /(?:under|below|less than|max|at most)?\s*(\d(?:\.\d+)?)\s*kg\b/i.exec(t);
  const warrantyYears = /(\d)\s*[- ]?(?:year|yr)s?\s*(?:of\s*)?(?:warranty|coverage)/i.exec(t);
  const warrantyMonths = /(\d{1,2})\s*[- ]?months?\s*(?:of\s*)?(?:warranty|coverage)/i.exec(t);
  const withinDays = /(?:within|in|by)\s*(\d{1,2})\s*days?/i.exec(t);

  const useCase = detectUseCase(t) ?? prev?.useCase ?? null;
  const explicitPriority = detectPriority(t);

  let maxDeliveryDays: number | null = prev?.maxDeliveryDays ?? null;
  if (withinDays) maxDeliveryDays = Number(withinDays[1]);
  else if (/\b(tomorrow|next[- ]day|overnight)\b/i.test(t)) maxDeliveryDays = 1;
  else if (/\bthis week\b/i.test(t)) maxDeliveryDays = 5;
  else if (/\b(fast(est)? (delivery|shipping)|asap|urgent(ly)?)\b/i.test(t)) maxDeliveryDays = maxDeliveryDays ?? 3;

  let minWarrantyMonths: number | null = prev?.minWarrantyMonths ?? null;
  if (warrantyYears) minWarrantyMonths = Number(warrantyYears[1]) * 12;
  else if (warrantyMonths) minWarrantyMonths = Number(warrantyMonths[1]);
  else if (/\b(long|extended|good|longer|solid)\s+(warranty|coverage)\b/i.test(t)) minWarrantyMonths = Math.max(minWarrantyMonths ?? 0, 24);

  let maxWeightKg: number | null = prev?.maxWeightKg ?? null;
  if (weight && category === "laptop") maxWeightKg = Number(weight[1]);
  else if (/\b(light(weight)?|ultra[- ]?light|ultraportable|portable|thin and light)\b/i.test(t) && category === "laptop")
    maxWeightKg = maxWeightKg ?? 1.6;

  let minStorageGb: number | null = prev?.minStorageGb ?? null;
  if (storage) minStorageGb = Math.round(Number(storage[1]) * (storage[2].toLowerCase() === "tb" ? 1024 : 1));

  const needsDedicatedGpu =
    /\b(dedicated|discrete)\s+(gpu|graphics)\b|\bgraphics card\b/i.test(t) || useCase === "gaming" || (prev?.needsDedicatedGpu ?? false);

  const intent: PurchaseIntent = {
    rawQuery: prev ? `${prev.rawQuery} · ${t}` : t,
    category,
    quantity: detectQuantity(t) ?? prev?.quantity ?? 1,
    budgetCents: extractBudget(t) ?? prev?.budgetCents ?? null,
    askDiscountPct: extractAskDiscount(t) ?? prev?.askDiscountPct ?? null,
    useCase,
    minRamGb: ram ? Number(ram[1]) : (prev?.minRamGb ?? null),
    minStorageGb,
    maxWeightKg,
    needsDedicatedGpu: category === "laptop" ? needsDedicatedGpu : false,
    minWarrantyMonths,
    maxDeliveryDays,
    preferredBrands: named || requiredBrand ? [] : brands.length ? brands : (prev?.preferredBrands ?? []),
    targetProductId: named?.id ?? (family || brands.length ? null : (prev?.targetProductId ?? null)),
    requiredBrand,
    requiredFamily,
    priority: explicitPriority ?? prev?.priority ?? "balanced",
    summary: "",
    source: "rules",
  };
  intent.summary = summarizeIntent(intent);
  return { intent, missing: [] };
}

const USE_LABEL: Record<UseCase, string> = {
  "video-editing": "video editing",
  gaming: "gaming",
  programming: "programming",
  student: "study",
  business: "business",
  travel: "travel",
  creative: "creative work",
  general: "everyday use",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  price: "lowest total price",
  warranty: "longest warranty",
  delivery: "fastest delivery",
  value: "most value in the box",
  balanced: "best overall deal",
};

export function summarizeIntent(i: PurchaseIntent): string {
  const head = `${i.quantity > 1 ? `${i.quantity} × ` : ""}${requestHead(i)}${i.useCase ? ` for ${USE_LABEL[i.useCase]}` : ""}`;
  const parts = [head];
  if (i.budgetCents) parts.push(`≤ ${formatMoney(i.budgetCents)} delivered`);
  if (i.askDiscountPct) parts.push(`asking ${Math.round(i.askDiscountPct * 100)}% off`);
  if (i.minRamGb) parts.push(`${i.minRamGb}GB+ RAM`);
  if (i.minStorageGb) parts.push(i.minStorageGb >= 1024 ? `${i.minStorageGb / 1024}TB+ storage` : `${i.minStorageGb}GB+ storage`);
  if (i.needsDedicatedGpu) parts.push("dedicated GPU");
  if (i.maxWeightKg) parts.push(`≤ ${i.maxWeightKg}kg`);
  if (i.minWarrantyMonths) parts.push(`${i.minWarrantyMonths}+ month warranty`);
  if (i.maxDeliveryDays) parts.push(`delivered in ≤ ${i.maxDeliveryDays} day${i.maxDeliveryDays === 1 ? "" : "s"}`);
  if (i.preferredBrands.length) parts.push(`prefers ${i.preferredBrands.join(", ")}`);
  parts.push(`aiming for the ${PRIORITY_LABEL[i.priority]}`);
  return parts.join(" · ");
}

export { USE_LABEL };
