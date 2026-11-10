/**
 * Card test transactions, following PayPal's Payflow "Test transactions"
 * guide: published test card numbers, MMYY expiry, amount-driven RESULT
 * values per processing platform, card security code (CVV2MATCH), address
 * verification (AVS), and the Litle Automatic Account Updater.
 *
 * Used only by the Nexus payment simulator; no real card is ever charged,
 * and full card numbers / security codes are never stored.
 *
 * Not simulated (they come from raw Payflow API parameters this checkout
 * never sends): 1 bad PWD, 2 bad TENDER, 3 bad TRXTYPE, 7/19 delayed capture
 * ORIGID, 22/113 ACH, 29 XMLPay, 101 timeout setting, 105/108/111 credit,
 * void and capture of authorizations.
 */

export type CardType = "amex" | "diners" | "discover" | "jcb" | "mastercard" | "visa";

export interface TestCard {
  brand: string;
  type: CardType;
  number: string;
  hsaFsa?: boolean;
  note?: string;
}

export const TEST_CARDS: TestCard[] = [
  { brand: "American Express", type: "amex", number: "378282246310005" },
  { brand: "American Express", type: "amex", number: "371449635398431" },
  { brand: "American Express Corporate", type: "amex", number: "378734493671000" },
  { brand: "Diners Club", type: "diners", number: "30569309025904" },
  { brand: "Discover", type: "discover", number: "6011111111111117" },
  { brand: "Discover", type: "discover", number: "6011000990139424" },
  { brand: "JCB", type: "jcb", number: "3530111333300000" },
  { brand: "JCB", type: "jcb", number: "3566002020360505" },
  { brand: "Mastercard", type: "mastercard", number: "2221000000000009" },
  { brand: "Mastercard", type: "mastercard", number: "2223000048400011" },
  { brand: "Mastercard", type: "mastercard", number: "2223016768739313" },
  { brand: "Mastercard", type: "mastercard", number: "5555555555554444" },
  { brand: "Mastercard", type: "mastercard", number: "5105105105105100" },
  { brand: "Visa", type: "visa", number: "4111111111111111" },
  { brand: "Visa", type: "visa", number: "4012888888881881" },
  { brand: "Visa", type: "visa", number: "4222222222222", note: "13 digits, still valid" },
  { brand: "Visa (HSA/FSA)", type: "visa", number: "4999991111111113", hsaFsa: true, note: "HSA/FSA: Paymentech Salem only" },
  { brand: "Visa (HSA/FSA)", type: "visa", number: "4999992222222229", hsaFsa: true, note: "HSA/FSA: Paymentech Salem only" },
  { brand: "Mastercard (HSA/FSA)", type: "mastercard", number: "5199999999999991", hsaFsa: true, note: "HSA/FSA: Paymentech Salem only" },
  { brand: "Mastercard (HSA/FSA)", type: "mastercard", number: "5299999999999990", hsaFsa: true, note: "HSA/FSA: Paymentech Salem only" },
];

/** Extra input card used only by the Litle Account Updater test table. */
const UPDATER_ONLY_CARD: TestCard = { brand: "Mastercard", type: "mastercard", number: "5560136761278244", note: "Account Updater test card" };

export const CARD_TYPES: Array<{ id: CardType; label: string }> = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "amex", label: "American Express" },
  { id: "discover", label: "Discover" },
  { id: "jcb", label: "JCB" },
  { id: "diners", label: "Diners Club" },
];

export type ProcessorId =
  | "payflow-simulator"
  | "amex"
  | "elavon"
  | "fiserv-north"
  | "fiserv-nashville"
  | "global-payments"
  | "paymentech-salem"
  | "paymentech-tampa"
  | "tsys"
  | "vantiv";

/**
 * "Result values based on amount submitted and processor": RESULT codes each
 * platform can return via AMT = 1000 + RESULT. The processor-only codes from
 * the alternate table are included (50 → Paymentech, 99 → Global Payments).
 */
export const PROCESSORS: Array<{ id: ProcessorId; label: string; codes: number[] }> = [
  { id: "payflow-simulator", label: "PayPal (Payflow Simulator)", codes: [] },
  { id: "amex", label: "American Express", codes: [12, 13, 104, 1000] },
  { id: "elavon", label: "Elavon", codes: [12, 13, 104] },
  { id: "fiserv-north", label: "FISERV North", codes: [4, 5, 12, 13, 23, 24, 114, 1000] },
  { id: "fiserv-nashville", label: "FISERV Nashville", codes: [12, 13, 104] },
  { id: "global-payments", label: "Global Payments", codes: [4, 5, 12, 13, 23, 24, 30, 99, 100, 104, 114, 1000] },
  { id: "paymentech-salem", label: "Paymentech Salem", codes: [12, 13, 50, 104] },
  { id: "paymentech-tampa", label: "Paymentech Tampa", codes: [3, 4, 5, 12, 13, 23, 24, 50, 1000] },
  { id: "tsys", label: "TSYS Acquiring Solutions", codes: [4, 12, 13, 23, 104, 114, 1000] },
  { id: "vantiv", label: "Vantiv", codes: [4, 5, 12, 13, 23, 24, 114, 1000] },
];

export interface CardTestSettings {
  processor: ProcessorId;
  /** Card types the store accepts; others return RESULT 25. */
  acceptedTypes: CardType[];
  /** Processor declines (RESULT 12, no CVV2MATCH) when the security code doesn't match. */
  declineOnCvvMismatch: boolean;
  /** Account configured with "AVS Deny": a failed AVS check returns RESULT 112. */
  avsDeny: boolean;
  /** Litle Automatic Account Updater enabled. */
  accountUpdater: boolean;
}

export const DEFAULT_CARD_SETTINGS: CardTestSettings = {
  processor: "payflow-simulator",
  acceptedTypes: CARD_TYPES.map((c) => c.id),
  declineOnCvvMismatch: false,
  avsDeny: false,
  accountUpdater: false,
};

export const RESULT_MESSAGES: Record<number, string> = {
  0: "Approved",
  3: "Invalid transaction type",
  4: "Invalid amount",
  5: "Invalid merchant information",
  7: "Field format error",
  12: "Declined",
  13: "Referral",
  23: "Invalid account number",
  24: "Invalid expiration date",
  25: "Transaction type not mapped to this host (processor)",
  30: "Duplicate transaction",
  50: "Insufficient funds available",
  99: "General error",
  100: "Invalid transaction returned from host (processor)",
  103: "Error reading response from host (processor)",
  104: "Timeout waiting for processor response",
  112: "Failed AVS check",
  114: "CVV2 mismatch",
  1000: "Generic host (processor) error",
};

/** Plain-language explanation for shoppers. */
export const RESULT_PLAIN: Record<number, string> = {
  0: "Your card was approved.",
  3: "The card network didn’t accept this type of payment.",
  4: "The card network rejected the amount.",
  5: "The card network couldn’t verify the store.",
  7: "Some card details were in the wrong format.",
  12: "Your bank declined the payment.",
  13: "Your bank wants you to call them before approving this payment.",
  23: "That card number isn’t valid. Use one of the test cards.",
  24: "The expiry date isn’t valid. Use a future date as MMYY.",
  25: "This store doesn’t accept this type of card.",
  30: "This looks like a duplicate payment, so it was stopped.",
  50: "There isn’t enough money available on this card.",
  99: "The card network had a general error. Try again.",
  100: "The card processor sent back something unexpected.",
  103: "We couldn’t read the card processor’s reply.",
  104: "The card processor took too long to reply. Try again.",
  112: "The billing address didn’t match the card.",
  114: "The security code (CVV) didn’t match the card.",
  1000: "The card processor had an error. Try again later.",
};

/** "Using the Payflow simulator for testing": amounts that force a RESULT. */
const PAYFLOW_SIMULATOR_AMOUNTS: Record<number, number[]> = {
  3: [10402],
  4: [10400, 10401, 10403, 10404],
  5: [10548, 10549],
  7: [10405, 10406, 10407, 10408, 10409, 10410, 10412, 10413, 10416, 10419, 10420, 10421, 10509, 10512, 10513, 10514, 10515, 10516, 10517, 10518, 10540, 10542],
  12: [10417, 15002, 15005, 15006, 15028, 15039, 10544, 10545, 10546],
  13: [10422],
  23: [10519, 10521, 10522, 10527, 10535, 10541, 10543],
  24: [10502, 10508],
  30: [10536],
  112: [10505],
  114: [10504],
};
const PAYFLOW_LOOKUP = new Map(Object.entries(PAYFLOW_SIMULATOR_AMOUNTS).flatMap(([code, amounts]) => amounts.map((a) => [a, Number(code)] as const)));

/** Litle Automatic Account Updater test tables. */
const UPDATER_CARDS: Record<string, string> = {
  "4111111111111111": "4321432143214321",
  "4012888888881881": "4012000033330026",
  "5105105105105100": "5454545454545454",
  "5560136761278244": "5105105105105100",
};
const UPDATER_EXPIRY: Record<string, string> = { "0000": "0919", "1213": "1218", "0120": "0150", "0230": "0250", "0340": "0350" };

export interface CardTestInput {
  number: string;
  /** MMYY */
  expiry: string;
  cvv?: string;
  street?: string;
  zip?: string;
  amountCents: number;
  settings: CardTestSettings;
}

export type MatchCode = "Y" | "N" | "X";

export interface CardTestResult {
  result: number;
  respmsg: string;
  approved: boolean;
  brand: string | null;
  last4: string;
  cvv2Match: MatchCode | null;
  avsAddr: MatchCode | null;
  avsZip: MatchCode | null;
  processor: ProcessorId;
  /** Litle Account Updater: CCUPDATED=Y plus what changed (last 4 only). */
  ccUpdated: boolean;
  updatedLast4: string | null;
  updatedExpiry: string | null;
}

export function amountResult(amountCents: number, processor: ProcessorId): number {
  if (amountCents < 0) return 4;
  const dollars = amountCents / 100;
  if (processor === "payflow-simulator") {
    if (dollars <= 10000) return 0;
    return Number.isInteger(dollars) ? (PAYFLOW_LOOKUP.get(dollars) ?? 1000) : 1000;
  }
  if (dollars <= 1000) return 0;
  if (dollars <= 2000) {
    if (!Number.isInteger(dollars)) return 12;
    const code = dollars - 1000;
    const supported = PROCESSORS.find((p) => p.id === processor)?.codes ?? [];
    return supported.includes(code) ? code : 12;
  }
  return 12;
}

export function validExpiry(mmyy: string, now = new Date()): boolean {
  const m = /^(\d{2})(\d{2})$/.exec(mmyy.replace(/\D/g, ""));
  if (!m) return false;
  const month = Number(m[1]);
  // Two-digit years: anything more than 50 years ahead is last century.
  // That makes the guide's invalid example "0298" February 1998, while the
  // Account Updater's "0150" stays January 2050.
  let year = 2000 + Number(m[2]);
  if (year > now.getFullYear() + 50) year -= 100;
  if (month < 1 || month > 12) return false;
  // Valid through the end of the expiry month; must be in the future.
  return new Date(year, month, 1).getTime() > now.getTime();
}

export function cvvMatch(cvv: string | undefined): MatchCode | null {
  if (!cvv) return null;
  const digits = cvv.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (n <= 300) return "Y";
  if (n <= 600) return "N";
  return "X";
}

export function avsMatch(street: string | undefined, zip: string | undefined): { avsAddr: MatchCode | null; avsZip: MatchCode | null } {
  const s = street?.trim() ?? "";
  const z = zip?.trim() ?? "";
  if (!s && !z) return { avsAddr: null, avsZip: null };
  const lead = /^(\d{3})/.exec(s);
  if (s && (!lead || Number(lead[1]) >= 667)) return { avsAddr: "X", avsZip: "X" };
  const avsAddr: MatchCode | null = lead ? (Number(lead[1]) <= 333 ? "Y" : "N") : null;
  const zipDigits = /^(\d{5})/.exec(z);
  const avsZip: MatchCode | null = zipDigits ? (Number(zipDigits[1]) <= 50000 ? "Y" : "N") : z ? "X" : null;
  return { avsAddr, avsZip };
}

/** Litle Account Updater: which details get replaced for this card, expiry and amount. */
export function accountUpdate(number: string, expiry: string, amountCents: number): { card: string | null; expiry: string | null } {
  const dollars = amountCents / 100;
  const both = dollars >= 500 && dollars < 1000;
  const cardOnly = dollars >= 400 && dollars < 500;
  const expiryOnly = dollars >= 300 && dollars < 400;
  return {
    card: (both || cardOnly) && UPDATER_CARDS[number] ? UPDATER_CARDS[number] : null,
    expiry: (both || expiryOnly) && UPDATER_EXPIRY[expiry] ? UPDATER_EXPIRY[expiry] : null,
  };
}

export function evaluateTestCard(input: CardTestInput, now = new Date()): CardTestResult {
  const s = input.settings;
  const digits = input.number.replace(/\D/g, "");
  const expiry = input.expiry.replace(/\D/g, "");
  const card = TEST_CARDS.find((c) => c.number === digits) ?? (s.accountUpdater && digits === UPDATER_ONLY_CARD.number ? UPDATER_ONLY_CARD : null);
  let cvv2Match = cvvMatch(input.cvv);
  const { avsAddr, avsZip } = avsMatch(input.street, input.zip);

  // The updater substitutes new details before the transaction reaches the network.
  const update = s.accountUpdater && card ? accountUpdate(digits, expiry, input.amountCents) : { card: null, expiry: null };
  const effectiveExpiry = update.expiry ?? expiry;

  let result: number;
  if (!card) result = 23;
  else if (card.hsaFsa && s.processor !== "paymentech-salem") result = 25;
  else if (!s.acceptedTypes.includes(card.type)) result = 25;
  else if (!validExpiry(effectiveExpiry, now)) result = 24;
  else result = amountResult(input.amountCents, s.processor);

  if (result === 0 && s.declineOnCvvMismatch && cvv2Match === "N") {
    result = 12;
    cvv2Match = null; // "declines … without returning a CVV2MATCH value"
  }
  if (result === 0 && s.avsDeny && (avsAddr === "N" || avsZip === "N")) result = 112;

  return {
    result,
    respmsg: RESULT_MESSAGES[result] ?? "Unknown result",
    approved: result === 0,
    brand: card?.brand ?? null,
    last4: digits.slice(-4),
    cvv2Match,
    avsAddr,
    avsZip,
    processor: s.processor,
    ccUpdated: Boolean(update.card || update.expiry),
    updatedLast4: update.card ? update.card.slice(-4) : null,
    updatedExpiry: update.expiry,
  };
}
