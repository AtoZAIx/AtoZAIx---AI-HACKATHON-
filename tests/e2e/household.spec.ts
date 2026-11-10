import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("quick setup: 4 screens, a few questions, a full plan with a live preview", async ({ page }) => {
  await page.goto("/money");
  // Personalised only: the setup is the starting point, with no ready-made splits.
  await expect(page.getByTestId("onboarding")).toBeVisible();

  // 1. Household (rupees by default)
  await page.getByTestId("household-kids").click();
  // Family count: 2 adults and 2 children → family of 4, 6-month emergency fund, 8% a month.
  await page.getByRole("button", { name: "More children" }).click();
  await expect(page.getByTestId("count-children")).toHaveText("2");
  await expect(page.getByTestId("family-count")).toContainText("Family of 4");
  await expect(page.getByTestId("family-count")).toContainText("6 months of essentials, 8% of income a month");
  await page.getByTestId("onboarding-next").click();
  // 2. Income
  await page.getByLabel("Your monthly take-home pay").fill("60000");
  await page.getByLabel("What your partner adds each month").fill("20000");
  // No limits yet: they're only worked out once the big costs are known.
  await expect(page.getByTestId("preview-waiting")).toBeVisible();
  await expect(page.getByTestId("preview-lifestyle")).toHaveCount(0);
  await page.getByTestId("onboarding-next").click();
  // 3. Big costs. Before any are entered, LIVE says what's missing instead of a bare ₹0.
  await expect(page.getByTestId("priority-live-meaning")).toHaveText("Add your monthly costs to see this");
  await page.getByLabel("Rent", { exact: true }).fill("15000");
  await page.getByTestId("other-costs").locator("summary").click();
  await page.getByLabel("Food and groceries").fill("8000");
  await page.getByLabel("Bills, transport and phone").fill("4000");
  await page.getByLabel("School and childcare").fill("3000");
  await expect(page.getByTestId("setup-preview")).toContainText("₹15,000"); // emergency fund each month
  // Personalised, category by category: real essentials, and a safe "spend up to" for each lifestyle category.
  await expect(page.getByTestId("setup-preview")).toContainText("Your personalised plan");
  await expect(page.getByTestId("preview-essentials")).toContainText("Rent");
  await expect(page.getByTestId("priority-live-meaning")).toHaveText("Must-pay costs: rent, food, bills, medical, EMIs, school");
  await expect(page.getByTestId("preview-essentials")).toContainText("₹15,000");
  for (const category of ["Food and outings", "Shopping", "Entertainment", "Travel"]) await expect(page.getByTestId("preview-lifestyle")).toContainText(category);
  await expect(page.getByTestId("preview-lifestyle")).toContainText("up to ₹");
  // LIVE ₹30,000 → BUILD 40% (₹32,000) → ENJOY ₹18,000, with travel and entertainment kept small.
  await expect(page.getByTestId("preview-build")).toContainText("₹32,000");
  // The pie chart and the family notes explain the plan.
  await expect(page.getByRole("img", { name: /Where your income goes: LIVE 38%/ })).toBeVisible();
  await expect(page.getByTestId("family-notes")).toContainText("Family of 4");
  await expect(page.getByTestId("family-notes")).toContainText("15% of extra savings per child");
  await expect(page.getByTestId("savings-rate")).toContainText("40%");
  await expect(page.getByTestId("preview-lifestyle")).toContainText("up to ₹1,800");
  // 4. Goals: tap "Buy a house", say how much and by when.
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("goal-pick-house").click();
  await page.getByLabel("House amount").fill("1200000");
  await page.getByLabel("House time").selectOption("60");
  await expect(page.getByTestId("preview-goals")).toContainText("House");
  // ₹12,00,000 over 5 years, starting at ₹3,394 and growing 5% a month (the default step-up).
  await expect(page.getByTestId("preview-goals")).toContainText("₹3,394");
  await expect(page.getByTestId("lock-rules")).toContainText("at least ₹1,000 a month");
  await expect(page.getByTestId("lock-rules")).toContainText("held safely in your name by a regulated partner bank");
  await expect(page.getByTestId("lock-rules")).toContainText("the rate isn’t fixed");
  await expect(page.getByTestId("lock-rules")).toContainText("7% wallet charge");
  await page.getByTestId("onboarding-finish").click();

  // The full plan, worked out from those answers.
  await expect(page.getByTestId("dash-income")).toHaveText("₹80,000");
  await expect(page.getByTestId("allowance")).toContainText("a day");
  await expect(page.getByTestId("category-limits")).toContainText("Rent");
  await expect(page.getByTestId("category-limits")).toContainText("Food and outings");
  await expect(page.getByTestId("emergency-summary")).toContainText("₹1,80,000"); // 6 months for a family
  // Rent is on auto-pay: recorded in the plan on the 1st, shown as paid, not as a warning.
  await expect(page.getByTestId("limit-Rent")).toContainText("Paid ₹15,000");
  await expect(page.getByTestId("autopay-Rent")).toContainText("Auto-paid");
  await expect(page.getByText("50/30/20")).toHaveCount(0);
  // Step-up: each house payment is 5% bigger than the last, with an honest warning about the last one.
  const house = page.getByTestId("goal-card").filter({ has: page.getByText("House", { exact: true }) });
  await expect(house.getByTestId("step-up-summary")).toContainText("This month ₹3,394 → next month ₹3,564");
  await expect(house.getByTestId("step-up-warning")).toContainText("about 18× the first");
  // Everything else lives under More.
  await page.getByTestId("more-tools").locator("summary").click();

  // A 2-year car savings plan with ₹1,00,000 already saved.
  await page.getByTestId("add-goal").click();
  await page.getByRole("button", { name: "Another goal" }).click();
  await page.getByTestId("goal-name").fill("Car");
  const form = page.locator("form").filter({ has: page.getByTestId("goal-name") });
  await form.getByLabel("Amount needed").fill("600000");
  await form.getByLabel("Saved so far").fill("100000");
  await page.getByTestId("goal-lock").selectOption("24");
  await page.getByTestId("save-goal").click();
  const car = page.getByTestId("goal-card").filter({ has: page.getByText("Car", { exact: true }) });
  await expect(car.getByTestId("vault")).toContainText("built to keep your money safe");
  await expect(car.getByTestId("vault")).toContainText("Today this plan is simulated");
  await expect(car.getByTestId("lock-timeline")).toContainText("Month 1 of 24");
  // Auto-save already put this month's ₹11,236 in: ₹5,00,000 − ₹11,236 is left.
  await expect(car.getByTestId("vault-to-go")).toContainText("₹4,88,764 to go over 24 months");
  await expect(car.getByTestId("vault-required")).toHaveText("₹11,236"); // ₹5,00,000 over 24 months, +5% a month
  // No interest is promised; at maturity you have what you put in.
  await expect(car.getByTestId("vault-maturity-total")).toContainText("₹6,00,000 of your own money");
  await expect(car.getByTestId("vault-minimum-rule")).toContainText("at least ₹1,000 a month, and all your goals together get at least 10% of your income");
  await expect(page.getByText(/% a year/)).toHaveCount(0);
  // Goals come first in BUILD, tracked month by month; the safety net follows.
  // The car fits after the house, and auto-save records this month's ₹11,236 by itself.
  await expect(page.getByTestId("tracker-Car")).toContainText("Saved this month");
  await expect(car.getByTestId("record-contribution")).toBeDisabled();
  // Switching the car to the same amount every month gives the flat ₹20,834.
  await car.getByTestId("step-up-choice").selectOption("none");
  await expect(car.getByTestId("vault-required")).toHaveText("₹20,834");
  await expect(car.getByTestId("step-up-warning")).toHaveCount(0);
  // Breaking the lock early shows the 7% wallet charge before anything is confirmed: ₹1,11,236 balance.
  await car.getByRole("button", { name: "Request early withdrawal" }).click();
  const quote = car.getByTestId("early-withdrawal-quote");
  await expect(quote).toContainText("7% wallet charge");
  await expect(quote).toContainText("−₹7,786");
  await expect(quote).toContainText("₹1,03,450");
  await car.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("tracker-House")).toContainText("month 1 of 60");
  await expect(page.getByTestId("goal-floor")).toContainText("At least 10% of your income (₹8,000)");
  // The house fund is on auto-save: this month's amount was recorded on the 1st by itself.
  await expect(page.getByTestId("tracker-House")).toContainText("auto-save on day 1");
  await expect(page.getByTestId("tracker-House")).toContainText("Saved this month");
  // Goals get at least 10% of income (₹8,000): the house's ₹3,394 was topped up to ₹8,000.
  await expect(house.getByTestId("auto-save-status")).toContainText("Saved ₹8,000");
  await expect(house.getByTestId("auto-save")).toContainText("doesn’t move money from your bank");

  // Auto-debit (simulated e-mandate): review, consent, approve, then skip a month and cancel.
  // Every automatic payment is listed in one card; auto-debit opens from there.
  const auto = page.getByTestId("auto-payments");
  await expect(auto.getByTestId("auto-row-Rent")).toContainText("Auto-pay on the 1st");
  await expect(auto.getByTestId("auto-row-House")).toContainText("Auto-save");
  await auto.getByTestId("auto-debit-House").click();
  const setup = house.getByTestId("mandate-setup");
  await expect(setup.getByTestId("mandate-summary")).toContainText("At least 24 hours before every debit");
  await expect(setup.getByTestId("mandate-continue")).toBeDisabled();
  await setup.getByTestId("mandate-agree-debit").check();
  await setup.getByTestId("mandate-agree-control").check();
  await setup.getByTestId("mandate-continue").click();
  await expect(house.getByTestId("mandate-approve")).toContainText("never ask for your UPI PIN");
  await house.getByTestId("mandate-approve-button").click();
  const active = house.getByTestId("mandate-active");
  await expect(active).toContainText("Auto-debit active");
  await expect(active).toContainText("Simulated");
  await expect(active.getByTestId("mandate-ref")).toHaveText(/^NXM-[0-9A-F]{8}$/);
  await expect(house.getByTestId("auto-save")).toHaveCount(0); // replaced by the auto-debit
  await expect(page.getByTestId("tracker-House")).toContainText("auto-debit on day 5");
  await expect(auto.getByTestId("auto-row-House")).toContainText("Auto-debit on");
  await active.getByTestId("mandate-skip").click();
  await active.getByTestId("mandate-confirm").click();
  await expect(active.getByTestId("mandate-next")).toContainText("You skipped");
  await active.getByTestId("mandate-cancel").click();
  await active.getByTestId("mandate-confirm").click();
  await expect(house.getByTestId("mandate-offer")).toContainText("Auto-debit was cancelled");
  await expect(house.getByTestId("auto-save")).toBeVisible(); // auto-save is back
  const order = await page.evaluate(() => {
    const y = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top;
    return y("goals-tracker") < y("build-summary");
  });
  expect(order).toBe(true);
  // The house goal from the setup has its own 5-year plan.
  await expect(page.getByTestId("goal-card").filter({ has: page.getByText("House", { exact: true }) }).getByTestId("vault")).toContainText("60 months");

  // Ask the coach.
  await page.getByTestId("coach-input").fill("Can I afford a car?");
  await page.getByTestId("coach-input").press("Enter");
  await expect(page.getByTestId("coach-answers")).toContainText("a month");

  // Editing starts from the same answers.
  await page.getByTestId("personalise").click();
  await expect(page.getByTestId("household-kids")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Cancel" }).click();

  // Life change under More tools: preview, then apply.
  await page.getByTestId("more-tools").locator("summary").click();
  await page.getByTestId("life-changes").getByLabel("What changed").selectOption("rent");
  await page.getByTestId("life-changes").getByLabel("New monthly rent").fill("18000");
  await page.getByTestId("preview-change").click();
  await page.getByTestId("apply-change").click();
  await expect(page.getByTestId("category-limits")).toContainText("₹18,000");

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
