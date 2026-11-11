import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addPasskeyDevice, passkeyIfAsked } from "./passkey-helper";

test.beforeEach(async ({ request, page }) => {
  expect((await request.post("/api/dev/reset")).ok()).toBe(true);
  await addPasskeyDevice(page); // Big approvals ask for a passkey: this device has one, like Face ID.
});

test("negotiate a house in the app → approve and pay only the refundable booking token", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("command-input").fill("buy a house in Austin under $450,000 with 3 bedrooms");
  await page.getByTestId("command-submit").click();
  await expect(page).toHaveURL(/\/negotiations\/ses_/);

  const recommended = page.locator('[data-testid^="offer-"]', { hasText: "Recommended" });
  await expect(recommended).toBeVisible({ timeout: 60_000 });
  await expect(recommended).toContainText("3-bed");
  await expect(recommended).toContainText("Possession in");
  await expect(recommended).toContainText("refundable token");
  await expect(recommended).not.toContainText("warranty");

  await recommended.getByRole("button", { name: "Choose this deal" }).click();
  await expect(page.getByRole("region", { name: "Deal locked" })).toContainText("All safety checks passed");
  await page.getByTestId("review-order").click();

  await expect(page).toHaveURL(/\/orders\/ord_/);
  const summary = page.getByTestId("booking-summary");
  await expect(summary).toContainText("Booking token (refundable)");
  await expect(summary).toContainText("Paid to the seller at closing");
  await expect(page.getByText("Closing fees", { exact: true })).toBeVisible();
  await expect(page.getByTestId("approve-order")).toContainText("Pay Token");
  const token = (await page.getByTestId("order-total").textContent())!.split(" ")[0].trim();
  // A token for a ~$400k home: between $1,000 and $5,000, never the full price.
  expect(Number(token.replace(/[$,]/g, ""))).toBeGreaterThanOrEqual(1_000);
  expect(Number(token.replace(/[$,]/g, ""))).toBeLessThanOrEqual(5_000);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByTestId("consent").check();
  await passkeyIfAsked(page);
  await page.getByTestId("approve-order").click();
  await page.getByTestId("pay-simulated").click();
  await expect(page.getByRole("dialog")).toContainText(token);
  await page.getByTestId("sim-approve").click();
  await expect(page.getByTestId("order-confirmed")).toBeVisible();
});

test("a rental is checked against the Rent amount in the customer's plan", async ({ page, request }) => {
  const { session } = await (await request.post("/api/sessions", { data: { text: "rent a 2 bedroom apartment under $2,200 a month" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();

  await page.goto("/");
  await page.evaluate(() => {
    const plan = {
      v: 1,
      salaryCents: 800_000,
      currency: "USD",
      profile: { maritalStatus: "single", householdSize: 1, children: 0 },
      incomes: [{ id: "inc-salary", kind: "salary", label: "Pay", amountCents: 800_000 }],
      bills: [
        { id: "rent", name: "Rent", group: "Housing", kind: "need", amountCents: 150_000 },
        { id: "shop", name: "Shopping", group: "Shopping", kind: "want", amountCents: 50_000 },
      ],
      goals: [],
      expenses: [],
      emergency: { targetMonths: 3, savedCents: 0, monthlyCents: 0 },
    };
    localStorage.setItem("nexus-money-plan-v1", JSON.stringify(plan));
  });
  await page.goto(`/orders/${order.id}`);
  const guard = page.getByTestId("spend-guard");
  await expect(guard).toHaveAttribute("data-verdict", "over"); // ~$2,000 rent vs $1,500 in the plan
  await expect(guard).toContainText("a month");
  await expect(guard).toContainText("Rent amount in your plan");
  await page.getByTestId("consent").check();
  await expect(page.getByTestId("approve-order")).toBeDisabled();
  await page.getByTestId("spend-guard-override").check();
  // The $1,028 token is over $1,000, so it also needs the customer's passkey.
  await expect(page.getByTestId("passkey-step")).toBeVisible();
  await passkeyIfAsked(page);
  await expect(page.getByTestId("approve-order")).toBeEnabled();
});

test("a big approval needs the customer's passkey, checked on the server", async ({ page, request }) => {
  const { session } = await (await request.post("/api/sessions", { data: { text: "buy a house in Austin under $450,000 with 3 bedrooms" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();

  // Skipping the screen and calling the API directly doesn't work: no passkey, no approval.
  const direct = await request.post(`/api/orders/${order.id}/approve`, { data: { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion } });
  expect(direct.status()).toBe(403);
  expect((await direct.json()).error).toMatch(/need your passkey/);

  await page.goto(`/orders/${order.id}`);
  const step = page.getByTestId("passkey-step");
  await expect(step).toHaveAttribute("data-state", "none");
  await expect(step).toContainText("Confirm it’s you");
  await page.getByTestId("consent").check();
  await expect(page.getByTestId("approve-order")).toBeDisabled(); // until a passkey is set up
  await passkeyIfAsked(page); // sets it up, and waits for the "Passkey set up" toast to settle
  await expect(page.getByTestId("passkey-ready")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.getByTestId("approve-order").click();
  await expect(page.getByText("Confirmed with your passkey")).toBeVisible();
  await expect(page.getByTestId("pay-simulated")).toBeVisible();

  // The passkey is remembered on this device: after a reload it's ready straight away.
  await page.goto(`/orders/${order.id}`);
  expect((await (await page.request.get("/api/passkey")).json()).registered).toBe(true);
});
