import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("money plan is personalised only: setup first, then goals, health and the coach", async ({ page }) => {
  await page.goto("/money");

  // No standard mode: the plan starts with the personal setup, and there is nothing to skip to.
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(page.getByLabel("Ready-made splits")).toHaveCount(0);
  await expect(page.getByText("50/30/20")).toHaveCount(0);

  await page.getByTestId("household-single").click();
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Your monthly take-home pay").fill("5000");
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Rent", { exact: true }).fill("1500");
  await page.getByTestId("other-costs").locator("summary").click();
  await page.getByLabel("Food and groceries").fill("600");
  await page.getByLabel("Bills, transport and phone").fill("400");
  await page.getByTestId("onboarding-next").click(); // goals: skip
  await page.getByTestId("onboarding-finish").click();

  await expect(page.getByTestId("money-planner")).toBeVisible();
  await expect(page.getByTestId("dash-income")).toHaveText("$5,000");
  await expect(page.getByTestId("allowance")).toContainText("a day");
  await expect(page.getByText("50/30/20")).toHaveCount(0);

  // A minimal page: overview, limits, saving. Everything else is folded under More.
  await expect(page.getByTestId("money-overview")).toBeVisible();
  await expect(page.getByTestId("more-tools")).not.toHaveAttribute("open");
  await expect(page.getByTestId("finish-plan")).toHaveCount(0); // rent was entered

  // Log spending in one line; the category's "left" amount drops.
  const outings = page.getByTestId("limit-Food and outings");
  const before = await outings.innerText();
  await page.getByLabel("Amount spent").fill("500");
  await page.getByTestId("spend-category").selectOption({ label: "Food and outings" });
  await page.getByTestId("log-spend").click();
  await expect(outings).not.toHaveText(before);
  await expect(page.getByLabel("Recent spending")).toContainText("$500");
  // Today's amount is tracked per category and recalculated for the days after.
  await expect(page.getByTestId("today-Food and outings")).toContainText("Today $500");
  await expect(page.getByTestId("today-summary")).toContainText("$500 spent today");
  // Quick log from a category row picks that category.
  await page.getByRole("button", { name: "Log spending on Shopping" }).click();
  await expect(page.getByTestId("spend-category")).toHaveValue(await page.getByTestId("spend-category").locator("option", { hasText: "Shopping" }).getAttribute("value") as string);

  // A goal funded from savings.
  await page.getByTestId("add-goal").click();
  await page.getByRole("button", { name: "Another goal" }).click();
  await page.getByTestId("goal-name").fill("New laptop");
  await page.getByLabel("Amount needed").fill("1200");
  await page.getByTestId("save-goal").click();
  await expect(page.getByTestId("goal-card")).toContainText("New laptop");
  // $1,200 over a year needs $100 a month, but goals get at least 10% of pay ($500), so it finishes sooner.
  await expect(page.getByTestId("goal-monthly")).toContainText("Save $500 a month");
  await expect(page.getByTestId("goal-monthly")).toContainText("sooner than");

  // More: just the coach, emergency fund, life changes and health score.
  await page.getByTestId("more-tools").locator("summary").click();
  await expect(page.getByTestId("preset-low-rent")).toHaveCount(0);
  await expect(page.getByTestId("money-guide")).toHaveCount(0);
  await expect(page.getByTestId("personal-targets")).toHaveCount(0);
  const spentText = (await outings.textContent()) ?? "";
  await expect(page.getByTestId("health-score")).toBeVisible();
  await page.getByTestId("ask-coach").click();
  await expect(page.getByTestId("coach-reply")).toContainText("Health score");

  // The plan survives a reload: it lives in this browser.
  await page.reload();
  await expect(page.getByTestId("dash-income")).toHaveText("$5,000");
  await expect(page.getByTestId("limit-Food and outings")).toHaveText(spentText);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("an older simple plan opens in the personal setup with its pay carried over", async ({ page }) => {
  await page.goto("/money");
  await page.evaluate(() =>
    localStorage.setItem(
      "nexus-money-plan-v1",
      JSON.stringify({ v: 1, salaryCents: 400_000, currency: "USD", bills: [{ id: "r", name: "Rent", kind: "need", pct: 0.3, amountCents: 120_000 }], goals: [], expenses: [] }),
    ),
  );
  await page.reload();
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByLabel("Your monthly take-home pay")).toHaveValue(/4,?000/);
});

test("business income counts only after costs, and the plan shows LIVE, ENJOY and BUILD", async ({ page }) => {
  await page.goto("/money");
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("earning-business").click();
  await page.getByLabel("Money your business brings in each month").fill("100000");
  await page.getByLabel("Business costs and tax set aside").fill("40000");
  await expect(page.getByText("Only what’s left counts as your income: ₹60,000 a month.")).toBeVisible();
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Rent", { exact: true }).fill("20000");
  await page.getByTestId("other-costs").locator("summary").click();
  await page.getByLabel("Food and groceries").fill("10000");
  await expect(page.getByTestId("savings-rate")).toContainText("Aim to save 35–45%");
  await page.getByTestId("onboarding-next").click(); // goals: skip
  await page.getByTestId("onboarding-finish").click();

  await expect(page.getByTestId("dash-income")).toHaveText("₹60,000"); // never the ₹1,00,000 turnover
  await expect(page.getByTestId("priority-live")).toContainText("₹30,000");
  await expect(page.getByTestId("priority-build")).toContainText("₹24,000"); // 40%
  await expect(page.getByTestId("savings-rate")).toContainText("On target");
  await expect(page.getByTestId("build-pots")).toContainText("Emergency fund");
  await expect(page.getByTestId("build-pots")).toContainText("Retirement");
});

test("without rent or EMIs the plan asks for them instead of showing misleading zeros", async ({ page }) => {
  await page.goto("/money");
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Your monthly take-home pay").fill("45000");
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-next").click(); // no rent or EMIs
  await page.getByTestId("onboarding-finish").click();

  await expect(page.getByTestId("finish-plan")).toContainText("add your rent and EMIs");
  // No daily amount or "On target" until the must-pay costs are known.
  await expect(page.getByTestId("allowance")).toContainText("Add your rent and EMIs to see what you can spend each day");
  await expect(page.getByTestId("money-overview").getByTestId("savings-rate")).toContainText("Not final yet");
  await expect(page.getByTestId("priority-live-meaning")).toHaveText("Add your monthly costs to see this");
  await expect(page.getByTestId("emergency-summary")).toContainText("Your target is set once you add rent and EMIs");
  await page.getByTestId("more-tools").locator("summary").click();
  await expect(page.getByTestId("health-score")).toHaveCount(0); // no score of "100" from missing data
  await expect(page.getByText("Add your rent and EMIs to see your health score.")).toBeVisible();

  // One tap goes straight to the Rent and EMIs screen.
  await page.getByTestId("add-costs").click();
  await expect(page.getByRole("heading", { name: "Rent and EMIs" })).toBeVisible();
  await page.getByLabel("Rent", { exact: true }).fill("12000");
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-finish").click();
  await expect(page.getByTestId("finish-plan")).toHaveCount(0);
  await expect(page.getByTestId("priority-live")).toContainText("₹12,000");
  await expect(page.getByTestId("allowance")).toContainText("more today");
});
