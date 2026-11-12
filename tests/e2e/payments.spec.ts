import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Start from a clean server: other tests leave paid orders, which (correctly) show in this month's payments.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/dev/reset")).ok()).toBe(true);
});

/** A rupee Money plan saved in this browser: rent on auto-pay, groceries, bills, and ENJOY categories. */
async function savePlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const bill = (id: string, name: string, group: string, kind: "need" | "want", rupees: number, extra = {}) => ({ id, name, group, kind, amountCents: rupees * 100, enteredCents: rupees * 100, frequency: "monthly", ...extra });
    const plan = {
      v: 1,
      salaryCents: 9_000_000,
      currency: "INR",
      profile: { maritalStatus: "single", householdSize: 1, children: 0 },
      incomes: [{ id: "inc-salary", kind: "salary", label: "Pay", amountCents: 9_000_000 }],
      bills: [
        bill("rent", "Rent", "Housing", "need", 20_000, { fixed: true, autoPay: { day: 1, lastMonth: null } }),
        bill("food", "Food and groceries", "Food and groceries", "need", 8_000),
        bill("bills", "Bills, transport and phone", "Utilities", "need", 4_000),
        bill("out", "Food and outings", "Food and outings", "want", 3_000),
        bill("ent", "Entertainment", "Entertainment", "want", 1_500),
      ],
      goals: [],
      expenses: [],
      emergency: { targetMonths: 3, savedCents: 0, monthlyCents: 700_000 },
    };
    localStorage.setItem("nexus-money-plan-v1", JSON.stringify(plan));
  });
  await page.goto("/money");
  await expect(page.getByTestId("payments")).toBeVisible();
}

test("paste bank messages → spending is detected, sorted and listed with auto-pay", async ({ page }) => {
  await savePlan(page);
  const payments = page.getByTestId("payments");
  // Rent's auto-pay already ran this month and is in the list.
  await expect(page.locator('[data-testid="payment-row"][data-source="auto-pay"]')).toContainText("Rent");

  await page.getByTestId("detect-input").fill(
    [
      "Rs.450.00 debited from A/c XX1234 to VPA swiggy@icici UPI Ref 4123. Avl Bal Rs.12,340.00",
      "INR 2,340 spent on HDFC Card XX9876 at DMART. Avl bal: INR 45,000",
      "Your a/c XX1234 is credited with Rs.90,000 (Salary)",
      "Rs 2000 to Ramesh Kumar",
    ].join("\n"),
  );
  await page.getByTestId("detect").click();
  const rows = page.getByTestId("detected-row");
  await expect(rows).toHaveCount(3); // the salary credit is skipped
  await expect(rows.nth(0)).toContainText("Swiggy");
  await expect(rows.nth(0).getByTestId("detected-category")).toHaveValue("out");
  await expect(rows.nth(1).getByTestId("detected-category")).toHaveValue("food");
  await expect(rows.nth(2).getByTestId("detected-category")).toHaveValue("free");
  await rows.nth(2).getByTestId("detected-category").selectOption("food"); // the user sorts the unknown payee

  const results = await new AxeBuilder({ page }).include('[data-testid="payments"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByTestId("add-detected").click();
  await expect(payments).toContainText("Added 3 payments");
  await expect(page.locator('[data-testid="payment-row"][data-source="detected"]')).toHaveCount(3);
  await expect(page.getByTestId("payments-total")).toContainText("₹24,790");

  // Pasting the same messages again adds nothing twice.
  await page.getByTestId("detect-input").fill("Rs 2000 to Ramesh Kumar");
  await page.getByTestId("detect").click();
  await expect(page.getByTestId("detected-row")).toContainText("already added");
  await expect(page.getByTestId("add-detected")).toBeDisabled();

  // Everything is still there after a reload.
  await page.reload();
  await expect(page.locator('[data-testid="payment-row"][data-source="detected"]')).toHaveCount(3);
});

test("add a monthly payment with auto-pay, taken out of a broader category", async ({ page }) => {
  await savePlan(page);
  const auto = page.getByTestId("auto-payments");
  await page.getByTestId("add-monthly-payment").click();
  await page.getByTestId("payment-name").fill("Electricity");
  await page.getByTestId("monthly-payment-form").getByLabel("Monthly amount").fill("1500");
  await page.getByTestId("payment-day").selectOption("1");
  await expect(page.getByTestId("payment-take-out")).toBeChecked();
  const results = await new AxeBuilder({ page }).include('[data-testid="auto-payments"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.getByTestId("save-monthly-payment").click();

  await expect(page.getByTestId("auto-row-Electricity")).toContainText("added by you");
  await expect(page.getByTestId("auto-row-Bills, transport and phone")).toContainText("₹2,500");
  await expect(auto.getByTestId("auto-total")).toContainText("₹21,500");

  await page.getByTestId("remove-payment-Electricity").click();
  await expect(page.getByTestId("auto-row-Electricity")).toHaveCount(0);
  await expect(page.getByTestId("auto-row-Bills, transport and phone")).toContainText("₹4,000");
});

test("bills, transport and phone is tracked day by day, with what the money went on", async ({ page }) => {
  await savePlan(page);
  // Variable LIVE categories get a daily amount; fixed rent on auto-pay doesn't.
  await expect(page.getByTestId("today-Bills, transport and phone")).toContainText("a day");
  await expect(page.getByTestId("today-Food and groceries")).toBeVisible();
  await expect(page.getByTestId("today-Rent")).toHaveCount(0);

  await page.getByTestId("detect-input").fill("Sent Rs.120 To Ola Cabs\nAirtel prepaid recharge 599\nRs 300 at Indian Oil petrol");
  await page.getByTestId("detect").click();
  await expect(page.getByTestId("detected-category")).toHaveCount(3);
  for (const select of await page.getByTestId("detected-category").all()) await expect(select).toHaveValue("bills");
  await page.getByTestId("add-detected").click();

  await expect(page.getByTestId("limit-Bills, transport and phone")).toContainText("₹2,981 left of ₹4,000");
  await expect(page.getByTestId("spent-on-Bills, transport and phone")).toHaveText("Spent on: Bills and recharge ₹599 · Fuel ₹300 · Transport ₹120");
  await expect(page.getByTestId("today-Bills, transport and phone")).toContainText("Today ₹1,019");
});
