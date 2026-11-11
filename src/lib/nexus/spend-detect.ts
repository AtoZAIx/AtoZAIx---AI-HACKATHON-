/**
 * Spending auto-detect: turns pasted bank SMS, UPI alerts, statement lines or
 * a quick note ("Swiggy 450") into payments sorted into the plan's own
 * categories (groceries, food, transport…).
 *
 * Deterministic and local: it runs in the browser on the text the user pasted.
 * Nothing is sent to a bank, to PayPal or to an AI service, and it never reads
 * messages by itself. It learns only from the user's own corrections.
 */
import type { BudgetItem, CurrencyCode, Expense, MoneyPlan } from "./budget";

export type SpendKind =
  | "groceries"
  | "eating-out"
  | "transport"
  | "fuel"
  | "utilities"
  | "health"
  | "rent"
  | "loan"
  | "education"
  | "subscriptions"
  | "shopping"
  | "travel"
  | "personal"
  | "other";

export const KIND_LABEL: Record<SpendKind, string> = {
  groceries: "Groceries",
  "eating-out": "Food and eating out",
  transport: "Transport",
  fuel: "Fuel",
  utilities: "Bills and recharge",
  health: "Health and medicines",
  rent: "Rent and housing",
  loan: "EMIs and loans",
  education: "School and education",
  subscriptions: "Movies and subscriptions",
  shopping: "Shopping",
  travel: "Travel",
  personal: "Fitness and personal care",
  other: "Not sure",
};

/** Shop and word list per kind. The longest match wins ("uber eats" beats "uber"). */
const KEYWORDS: Record<Exclude<SpendKind, "other">, string[]> = {
  groceries: [
    "dmart", "d mart", "avenue supermarts", "bigbasket", "big basket", "blinkit", "grofers", "zepto", "instamart", "jiomart", "reliance fresh", "reliance smart", "more supermarket",
    "more retail", "spencer", "nature's basket", "star bazaar", "ratnadeep", "kirana", "grocery", "groceries", "supermarket", "vegetables", "fruits", "milk", "dairy", "nandini", "amul",
    "country delight", "walmart", "costco", "kroger", "safeway", "whole foods", "trader joe", "aldi", "lidl", "tesco", "sainsbury", "asda", "morrisons", "waitrose", "carrefour", "target",
  ],
  "eating-out": [
    "swiggy", "zomato", "uber eats", "ubereats", "doordash", "grubhub", "deliveroo", "just eat", "eatsure", "restaurant", "cafe", "café", "coffee", "starbucks", "costa", "ccd", "cafe coffee day",
    "chaayos", "mcdonald", "kfc", "burger king", "domino", "pizza hut", "pizza", "subway", "haldiram", "barbeque nation", "biryani", "bakery", "dhaba", "food", "dining", "chipotle", "taco bell",
  ],
  transport: ["uber", "ola", "rapido", "lyft", "metro", "irctc", "railway", "redbus", "bus pass", "auto rickshaw", "taxi", "cab", "parking", "fastag", "toll", "namma yatri", "bmtc", "best bus"],
  fuel: ["petrol", "diesel", "fuel", "hpcl", "bpcl", "iocl", "indian oil", "bharat petroleum", "hindustan petroleum", "shell", "chevron", "exxon", "bp ", "nayara", "cng"],
  utilities: [
    "electricity", "bescom", "tneb", "tangedco", "msedcl", "mahadiscom", "adani electricity", "tata power", "bses", "power bill", "water bill", "indane", "bharat gas", "hp gas", "gas cylinder",
    "piped gas", "airtel", "jio", "vodafone", "vi recharge", "bsnl", "act fibernet", "hathway", "broadband", "wifi", "internet", "recharge", "postpaid", "prepaid", "dth", "tata play", "comcast",
    "verizon", "at&t", "t-mobile",
  ],
  health: ["pharmacy", "chemist", "medical", "medicine", "apollo", "medplus", "1mg", "tata 1mg", "pharmeasy", "netmeds", "hospital", "clinic", "doctor", "diagnostic", "lab test", "dental", "cvs", "walgreens", "boots"],
  rent: ["rent", "house rent", "nobroker", "maintenance", "society", "landlord", "apartment"],
  loan: ["emi", "loan", "bajaj finance", "home credit", "credit card payment", "card payment", "cred", "repayment", "mortgage"],
  education: ["school", "college", "tuition", "fees", "byju", "unacademy", "vedantu", "coursera", "udemy", "books", "stationery"],
  subscriptions: [
    "netflix", "prime video", "amazon prime", "hotstar", "disney", "jiocinema", "sonyliv", "zee5", "spotify", "youtube premium", "apple music", "gaana", "bookmyshow", "pvr", "inox", "cinema",
    "movie", "steam", "playstation", "xbox", "hbo", "hulu",
  ],
  shopping: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "tata cliq", "croma", "reliance digital", "decathlon", "ikea", "h&m", "zara", "uniqlo", "lifestyle stores", "westside", "pantaloons", "shopping", "ebay", "etsy"],
  travel: ["makemytrip", "goibibo", "cleartrip", "yatra", "ixigo", "indigo", "air india", "vistara", "akasa", "spicejet", "airbnb", "oyo", "booking.com", "expedia", "hotel", "flight", "airline", "resort"],
  personal: ["gym", "cult.fit", "cultfit", "fitness", "yoga", "salon", "spa", "barber", "urban company", "parlour", "parlor", "cosmetics"],
};

/** The plan categories (by group) each kind is counted in, best first. */
const GROUPS: Record<SpendKind, { groups: string[]; want: boolean }> = {
  groceries: { groups: ["Food and groceries"], want: false },
  "eating-out": { groups: ["Food and outings"], want: true },
  transport: { groups: ["Transport", "Utilities"], want: false },
  fuel: { groups: ["Transport", "Utilities"], want: false },
  utilities: { groups: ["Utilities"], want: false },
  health: { groups: ["Healthcare"], want: false },
  rent: { groups: ["Housing"], want: false },
  loan: { groups: ["Loans and debt"], want: false },
  education: { groups: ["Family and children"], want: false },
  subscriptions: { groups: ["Entertainment"], want: true },
  shopping: { groups: ["Shopping"], want: true },
  travel: { groups: ["Travel"], want: true },
  personal: { groups: ["Lifestyle"], want: true },
  other: { groups: [], want: true },
};

export interface DetectedPayment {
  /** Stable for the same date, amount and shop: a second paste is spotted as a duplicate. */
  key: string;
  date: string;
  amountCents: number;
  merchant: string;
  kind: SpendKind;
  /** Category in the plan this goes to; null = not in the plan (unplanned spending). */
  billId: string | null;
  /** Why: the word that matched, or that the user sorted this shop before. */
  reason: string;
  learned: boolean;
  duplicate: boolean;
  /** The text named a different currency from the plan's. */
  otherCurrency: string | null;
  line: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SYMBOL: Array<[RegExp, CurrencyCode]> = [
  [/₹|\brs\.?|\binr\b|rupees?/i, "INR"],
  [/\$|\busd\b|dollars?/i, "USD"],
  [/€|\beur\b|euros?/i, "EUR"],
  [/£|\bgbp\b|pounds?/i, "GBP"],
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A shop name reduced to a short key for remembering the user's choices. */
export const merchantKey = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Dates as banks write them; anything unreadable, or in the future, becomes today. */
export function findDate(text: string, today: string, currency: CurrencyCode = "INR"): string {
  const year = Number(today.slice(0, 4));
  const ok = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (dt.getUTCMonth() + 1 !== m || iso > today) return null;
    return iso;
  };
  if (/\byesterday\b/i.test(text)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) return ok(+m[1], +m[2], +m[3]) ?? today;
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    // Day first, except US-dollar plans write month first (unless that can't be a month).
    const monthFirst = currency === "USD" && a <= 12 && b > 0;
    return (monthFirst ? ok(+m[3], a, b) : ok(+m[3], b, a)) ?? ok(+m[3], b, a) ?? today;
  }
  m = new RegExp(`\\b(\\d{1,2})[\\s-]?(${MONTHS.join("|")})[a-z]*[\\s,-]*(\\d{2,4})?\\b`, "i").exec(text);
  if (m) return ok(m[3] ? +m[3] : year, MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]) ?? today;
  m = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?\\b`, "i").exec(text);
  if (m) return ok(m[3] ? +m[3] : year, MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]) ?? today;
  return today;
}

const toCents = (s: string) => Math.round(Number(s.replace(/,/g, "")) * 100);

/** The amount paid: a currency-marked number that isn't a balance or limit; else a plain number in a short note. */
export function findAmount(text: string): { cents: number; currency: CurrencyCode | null } | null {
  const marked = /(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(rs\.?|inr|rupees|usd|dollars|eur|gbp)\b/gi;
  for (const m of text.matchAll(marked)) {
    const before = text.slice(Math.max(0, m.index! - 16), m.index!).toLowerCase();
    if (/(bal|balance|limit|available)[\s:.]*$/.test(before)) continue;
    const cents = toCents(m[2] ?? m[3]);
    if (!cents) continue;
    const sym = m[1] ?? m[4];
    return { cents, currency: SYMBOL.find(([re]) => re.test(sym))?.[1] ?? null };
  }
  // A quick note: "Swiggy 450", "450 groceries", "dmart 2,340.50". Skip dates, times and card or account digits.
  if (text.length > 80) return null;
  const cleaned = text.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{1,2}:\d{2}\b|\b(?:x+|\*+)\d+\b|\b(?:a\/c|acct?|card)\s*\S+/gi, " ");
  const plain = [...cleaned.matchAll(/(?:^|\s)([\d,]*\d(?:\.\d{1,2})?)(?=\s|$)/g)].map((m) => m[1]);
  const pick = plain.find((n) => toCents(n) > 0);
  return pick ? { cents: toCents(pick), currency: null } : null;
}

/** Who was paid: "at X", "to X", "towards X", a UPI id, or the words of a quick note. */
export function findMerchant(text: string): string {
  const stop = String.raw`(?=\s+(?:on|via|using|ref|upi|txn|avl|avbl|from|dated|thru|through|for|is|has|was)\b|[.,;:(]|\s+\d|$)`;
  const vpa = /\b([a-z][a-z0-9._-]{1,30})@[a-z]{2,}\b/i.exec(text);
  const at = new RegExp(String.raw`\b(?:at|to|towards|paid to|info:?|merchant:?)\s+([A-Za-z&'][\w&'.\- ]{1,40}?)` + stop, "i").exec(text);
  let name = at?.[1] ?? (vpa ? vpa[1].replace(/[._-]+/g, " ") : "");
  if (!name || /^(your|a\/c|ac|account|card|you|mr|ms)\b/i.test(name)) {
    name = text
      .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, " ")
      .replace(/(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?/gi, " ")
      .replace(/\b(spent|paid|debited|sent|for|on|at|to|bought|buy|the|a|an|via|upi|using|card|rs|inr|today|yesterday|from|my|of|and|order|txn)\b/gi, " ")
      .replace(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\b`, "gi"), " ")
      .replace(/[^\p{L}&' .-]/gu, " ")
      .replace(/(^|\s)[-.&']+(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  name = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (name && name === name.toUpperCase()) name = name.toLowerCase();
  return name ? name.replace(/(^|[\s&'.-])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase()) : "Payment";
}

/** The kind of spending, from the shop name first and then the whole line. */
export function detectKind(merchant: string, line = ""): { kind: SpendKind; word: string | null } {
  for (const hay of [merchant, line]) {
    const h = ` ${hay.toLowerCase()} `;
    let best: { kind: SpendKind; word: string } | null = null;
    for (const [kind, words] of Object.entries(KEYWORDS) as Array<[SpendKind, string[]]>) {
      for (const w of words) {
        const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim()}([^a-z]|$)`);
        if (re.test(h) && (!best || w.length > best.word.length)) best = { kind, word: w.trim() };
      }
    }
    if (best) return best;
  }
  return { kind: "other", word: null };
}

/** The plan category a kind of spending goes to: same group first, else the closest LIVE or ENJOY category. */
export function billFor(plan: MoneyPlan, kind: SpendKind): BudgetItem | null {
  const g = GROUPS[kind];
  for (const group of g.groups) {
    const hit = plan.bills.find((b) => b.group === group && !b.recurring) ?? plan.bills.find((b) => b.group === group);
    if (hit) return hit;
  }
  if (kind === "other") return null;
  // No matching category: ENJOY spending goes to the first ENJOY category; must-pays stay unplanned.
  return g.want ? (plan.bills.find((b) => b.kind === "want") ?? null) : null;
}

const isCredit = (t: string) => /\b(credited|received|refund(?:ed)?|cashback|reversed|deposited)\b/i.test(t) && !/\b(debited|spent|paid|sent)\b/i.test(t);
const isNoise = (t: string) => /\b(otp|one time password|verification code|do not share)\b/i.test(t);

/** Splits pasted text into payment lines: one per line, or per CSV row. */
function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);
}

/** A statement row "05/11/2026, ZOMATO ORDER, 450.00, , 12,340.00": date, the description and the first amount. */
function fromCsv(line: string): { text: string; cents: number } | null {
  const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)|;/).map((c) => c.replace(/^"|"$/g, "").trim());
  if (cells.length < 3) return null;
  const amount = cells.find((c) => /^-?[\d,]+\.\d{2}$/.test(c) || /^-?\d+$/.test(c));
  if (!amount || toCents(amount.replace("-", "")) <= 0) return null;
  const date = cells.find((c) => /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s-][a-z]{3}/i.test(c)) ?? "";
  const desc = (cells.filter((c) => /[a-z]{3,}/i.test(c) && c !== date).sort((a, b) => b.length - a.length)[0] ?? "").replace(/\b\d{3,}\b/g, " ");
  return { text: `${date} ${desc}`, cents: toCents(amount.replace("-", "")) };
}

/** Reads pasted text and returns the payments found, sorted into the plan's categories. */
export function detectPayments(plan: MoneyPlan, text: string, today: string): DetectedPayment[] {
  const currency = plan.currency ?? "USD";
  const out: DetectedPayment[] = [];
  for (const raw of lines(text)) {
    if (isNoise(raw) || isCredit(raw)) continue;
    const csv = raw.split(/,|\t|;/).length >= 3 && !findAmount(raw)?.currency ? fromCsv(raw) : null;
    const line = csv?.text ?? raw;
    const amount = csv ? { cents: csv.cents, currency: null } : findAmount(line);
    if (!amount) continue;
    const date = findDate(line, today, currency);
    const merchant = findMerchant(line);
    const key = merchantKey(merchant);
    const ruleBill = plan.merchantRules?.[key];
    const learned = Boolean(ruleBill && (ruleBill === "free" || plan.bills.some((b) => b.id === ruleBill)));
    const { kind, word } = detectKind(merchant, line);
    // A monthly payment you added ("Netflix", "Electricity") is matched by name first.
    const own = plan.bills.find((b) => b.recurring && merchantKey(b.name).length >= 3 && key.includes(merchantKey(b.name)));
    const paidByAutoPay = Boolean(own?.autoPay && own.autoPay.lastMonth === date.slice(0, 7));
    const billId = learned ? (ruleBill === "free" ? null : ruleBill!) : (own?.id ?? billFor(plan, kind)?.id ?? null);
    const id = `det-${hash(`${date}|${amount.cents}|${key}`)}`;
    out.push({
      key: id,
      date,
      amountCents: amount.cents,
      merchant,
      kind,
      billId,
      reason: paidByAutoPay ? `Already recorded by ${own!.name} auto-pay` : learned ? "You sorted this shop before" : own ? `Your monthly payment “${own.name}”` : word ? `Matched “${word}”` : "No match: please choose",
      learned,
      duplicate: paidByAutoPay || plan.expenses.some((e) => e.id === id) || out.some((o) => o.key === id),
      otherCurrency: amount.currency && amount.currency !== currency ? amount.currency : null,
      line: raw.slice(0, 160),
    });
  }
  return out;
}

/**
 * Adds the chosen payments to the plan's spending (skipping duplicates). When
 * the user changed a category, that shop is remembered for next time.
 */
export function addDetected(plan: MoneyPlan, picked: Array<DetectedPayment & { chosenBillId: string | null }>): { plan: MoneyPlan; added: number } {
  const have = new Set(plan.expenses.map((e) => e.id));
  const rules = { ...(plan.merchantRules ?? {}) };
  const added: Expense[] = [];
  for (const p of picked) {
    if (p.amountCents <= 0 || have.has(p.key)) continue;
    have.add(p.key);
    added.push({
      id: p.key,
      date: p.date,
      amountCents: p.amountCents,
      note: p.merchant.slice(0, 120),
      source: p.chosenBillId ? { kind: "bill", billId: p.chosenBillId } : { kind: "free" },
    });
    const k = merchantKey(p.merchant);
    if (k.length >= 2 && (p.chosenBillId !== p.billId || p.learned)) rules[k] = p.chosenBillId ?? "free";
  }
  if (!added.length) return { plan, added: 0 };
  return { plan: { ...plan, expenses: [...plan.expenses, ...added], merchantRules: rules }, added: added.length };
}

/** Short names for the spending breakdown inside one category. */
const SHORT: Record<SpendKind, string> = {
  groceries: "Groceries",
  "eating-out": "Eating out",
  transport: "Transport",
  fuel: "Fuel",
  utilities: "Bills and recharge",
  health: "Medicines",
  rent: "Housing",
  loan: "EMIs",
  education: "Education",
  subscriptions: "Subscriptions",
  shopping: "Shopping",
  travel: "Travel",
  personal: "Personal care",
  other: "Other",
};

/**
 * What one category's money went on this month, by kind, biggest first: so a
 * broad category like "Bills, transport and phone" shows transport, phone and
 * electricity separately. Uses the shop or note saved with each payment.
 */
export function spentByKind(plan: MoneyPlan, billId: string, month: string): Array<{ kind: SpendKind; label: string; cents: number }> {
  const totals = new Map<SpendKind, number>();
  for (const e of plan.expenses) {
    if (!e.date.startsWith(month) || e.source.kind !== "bill" || e.source.billId !== billId || e.id.startsWith("auto-")) continue;
    const kind = e.note ? detectKind(e.note).kind : "other";
    totals.set(kind, (totals.get(kind) ?? 0) + e.amountCents);
  }
  return [...totals.entries()].map(([kind, cents]) => ({ kind, label: SHORT[kind], cents })).sort((a, b) => b.cents - a.cents);
}
