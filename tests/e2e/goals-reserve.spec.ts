import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** ₹90,000 pay (10% for goals = ₹9,000) and a small ₹1,500 car goal, saved in this browser. */
test("10% for goals is mandatory: what a small goal doesn't need goes to the Goals reserve, then into goals", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const month = new Date().toISOString().slice(0, 7);
    const plan = {
      v: 1,
      salaryCents: 9_000_000,
      currency: "INR",
      profile: { maritalStatus: "single", householdSize: 1, children: 0 },
      incomes: [{ id: "inc-salary", kind: "salary", label: "Pay", amountCents: 9_000_000 }],
      bills: [{ id: "rent", name: "Rent", group: "Housing", kind: "need", amountCents: 2_000_000, enteredCents: 2_000_000, frequency: "monthly", fixed: true }],
      goals: [{ id: "car", name: "Car", targetCents: 150_000, savedCents: 0, dueMonth: "2030-10", priority: "medium", startMonth: month, lockMonths: 48, contributions: [], autoSave: null, paused: false, chosenMonthlyCents: null, withdrawal: null }],
      expenses: [],
      emergency: { targetMonths: 3, savedCents: 0, monthlyCents: 0 },
    };
    localStorage.setItem("nexus-money-plan-v1", JSON.stringify(plan));
  });
  await page.goto("/money");

  // ₹1,500 to the car (all it needs) + ₹7,500 to the Goals reserve = the full ₹9,000.
  await expect(page.getByTestId("goal-floor")).toContainText("10% of your income (₹9,000) goes to your goals every month");
  await expect(page.getByTestId("goal-floor")).toContainText("₹1,500 into your goals and ₹7,500 to your Goals reserve");
  const reserve = page.getByTestId("goals-reserve");
  await expect(page.getByTestId("goals-reserve-saved")).toHaveText("₹7,500");
  await expect(reserve).toContainText("never moved to spending");
  const results = await new AxeBuilder({ page }).include('[data-testid="goals-reserve"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Move it into the car: only what the car still needs moves; the rest stays for the next goal.
  await page.getByTestId("vault-pay-due").or(page.getByTestId("record-contribution")).first().waitFor();
  await page.getByTestId("goals-reserve-move").click();
  await expect(page.getByTestId("tracker-Car")).toContainText("Reached");
  await expect(page.getByTestId("goals-reserve-saved")).toHaveText("₹6,000");
  await expect(reserve).toContainText("Your next goal can start with this money");

  // Still there after a reload.
  await page.reload();
  await expect(page.getByTestId("goals-reserve-saved")).toHaveText("₹6,000");
});
