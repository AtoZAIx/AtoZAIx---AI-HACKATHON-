import { describe, expect, it } from "vitest";
import { numbersConsistent } from "@/lib/nexus/agents/guardrails";
import { extractBudget, parseIntentRules } from "@/lib/nexus/intent";
import { charm, formatMoney, parsePayPalValue, toPayPalValue } from "@/lib/nexus/money";

describe("money", () => {
  it("round-trips PayPal decimal strings without float drift", () => {
    for (const cents of [0, 1, 99, 100, 148800, 123456789]) expect(parsePayPalValue(toPayPalValue(cents))).toBe(cents);
    expect(toPayPalValue(148805)).toBe("1488.05");
    expect(parsePayPalValue("10.5")).toBe(1050);
    expect(() => parsePayPalValue("1e3")).toThrow();
    expect(() => toPayPalValue(1.5)).toThrow();
  });
  it("formats and charm-prices", () => {
    expect(formatMoney(148800)).toBe("$1,488");
    expect(formatMoney(148850)).toBe("$1,488.50");
    expect(charm(180000)).toBe(179900);
  });
});

describe("intent rules", () => {
  it("extracts budget without confusing specs for money", () => {
    expect(extractBudget("laptop under $1,800 with 32GB RAM")).toBe(180000);
    expect(extractBudget("budget 1.5k")).toBe(150000);
    expect(extractBudget("under 16GB and under 2kg")).toBeNull();
    expect(extractBudget("delivered within 3 days")).toBeNull();
    expect(extractBudget("around $500")).toBe(52500);
  });

  it("parses a full brief", () => {
    const { intent } = parseIntentRules("Lightweight laptop for programming, 1TB SSD, 2 year warranty, budget $1,200, fast delivery");
    expect(intent).toMatchObject({
      category: "laptop",
      useCase: "programming",
      budgetCents: 120000,
      minStorageGb: 1024,
      minWarrantyMonths: 24,
      maxWeightKg: 1.6,
      maxDeliveryDays: 3,
      priority: "delivery",
    });
  });

  it("asks for a category when it can't tell", () => {
    expect(parseIntentRules("something nice under $500")).toEqual({ intent: null, missing: ["category"] });
  });

  it("detects an exact model and refines a previous brief", () => {
    const first = parseIntentRules("Find me the best deal on the MacBook Pro 14").intent!;
    expect(first.targetProductId).toBe("apple-macbook-pro-14");
    const refined = parseIntentRules("make it under $1,600 and I prefer a longer warranty", first).intent!;
    expect(refined.targetProductId).toBe("apple-macbook-pro-14");
    expect(refined.budgetCents).toBe(160000);
    expect(refined.minWarrantyMonths).toBe(24);
  });

  it("does not map photo editing to video editing", () => {
    expect(parseIntentRules("monitor for photo editing").intent!.useCase).toBe("creative");
  });
});

describe("number guardrail", () => {
  it("rejects narration that misstates prices", () => {
    expect(numbersConsistent("We can do $1,499, $1,518 delivered.", [149900, 151800])).toBe(true);
    expect(numbersConsistent("We can do $1,399 today!", [149900, 151800])).toBe(false);
    expect(numbersConsistent("Happy to help", [])).toBe(true);
  });
});

describe("number guardrail edge cases", () => {
  it("does not let $1 match a $0 free-shipping amount", () => {
    expect(numbersConsistent("Fine, $1.", [0, 179900])).toBe(false);
  });
});

describe("brands and model lines", () => {
  it("treats a named product line as a must-have", () => {
    const i = parseIntentRules("I want a MacBook Pro for video editing under $2,000").intent!;
    expect(i).toMatchObject({ category: "laptop", requiredBrand: "Apple", requiredFamily: "MacBook Pro", targetProductId: null });
    expect(parseIntentRules("an iPhone under $700").intent).toMatchObject({ category: "phone", requiredBrand: "Apple", requiredFamily: "iPhone" });
    expect(parseIntentRules("Pixel phone").intent).toMatchObject({ category: "phone", requiredBrand: "Google", requiredFamily: "Pixel" });
  });

  it("treats a single named brand as a must-have and soft wording as a preference", () => {
    expect(parseIntentRules("Samsung phone under $900").intent).toMatchObject({ requiredBrand: "Samsung", requiredFamily: null });
    const soft = parseIntentRules("gaming laptop, ideally ASUS or Lenovo, under $1,600").intent!;
    expect(soft.requiredBrand).toBeNull();
    expect(soft.preferredBrands.sort()).toEqual(["ASUS", "Lenovo"]);
  });

  it("matches the most specific model name", () => {
    expect(parseIntentRules("iphone 17 pro max please").intent!.targetProductId).toBe("apple-iphone-17-pro-max");
    expect(parseIntentRules("best price on iPhone 17 Pro").intent!.targetProductId).toBe("apple-iphone-17-pro");
    expect(parseIntentRules("Sony xm6 headphones").intent!.targetProductId).toBe("sony-wh-1000xm6");
    expect(parseIntentRules("Galaxy S25 Ultra").intent!.targetProductId).toBe("samsung-galaxy-s25-ultra");
  });
});
