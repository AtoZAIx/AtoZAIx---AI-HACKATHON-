import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.RESULT_SHOTS ?? "";

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/dev/reset")).ok()).toBe(true);
});

/** A negotiated order under $1,000 (no passkey needed), opened at the PayPal step. */
async function openPayment(page: Page, request: APIRequestContext) {
  const { session } = await (await request.post("/api/sessions", { data: { text: "noise cancelling headphones for travel under $400" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();
  await page.goto(`/orders/${order.id}`);
  await page.getByTestId("consent").check();
  await page.getByTestId("approve-order").click();
  await page.getByTestId("pay-simulated").click();
  return order.id as string;
}

async function check(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).include('[data-testid="payment-result"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  if (SHOTS) {
    await page.waitForTimeout(1600); // let the animation finish
    await page.getByTestId("payment-result").screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png` });
  }
}

test("success: an animated confirmation with the amount, store and next steps", async ({ page, request }) => {
  await openPayment(page, request);
  await page.getByTestId("sim-approve").click();
  const result = page.getByTestId("payment-result");
  await expect(result).toHaveAttribute("data-kind", "success");
  await expect(result).toContainText("Payment successful");
  await expect(result).toContainText("Checked with PayPal");
  await expect(page.getByRole("link", { name: /See payment details/ })).toBeVisible();
  await check(page, "success");
});

test("pending: PayPal holds the payment, the page shows progress, then confirms by itself", async ({ page, request }) => {
  await openPayment(page, request);
  await page.getByTestId("sim-review").click();
  const result = page.getByTestId("payment-result");
  await expect(result).toHaveAttribute("data-kind", "pending");
  await expect(result).toContainText("Payment on hold");
  await expect(page.getByTestId("pending-steps")).toContainText("PayPal is reviewing the payment");
  await check(page, "pending");
  await page.getByTestId("sim-review-complete").click();
  await expect(result).toHaveAttribute("data-kind", "success");
});

test("failure: the bank declines, nothing is charged, and trying again works", async ({ page, request }) => {
  await openPayment(page, request);
  await page.getByTestId("sim-decline").click();
  const result = page.getByTestId("payment-result");
  await expect(result).toHaveAttribute("data-kind", "failure");
  await expect(page.getByTestId("result-reason")).toContainText("declined the payment");
  await expect(result).toContainText("You weren’t charged");
  await check(page, "failure");
  // The PayPal buttons are still there: pay again and it goes through.
  await page.getByTestId("retry-checkout").click();
  await page.getByTestId("pay-simulated").click();
  await page.getByTestId("sim-approve").click();
  await expect(result).toHaveAttribute("data-kind", "success");
});

test("declined after review: Try again starts a fresh payment for the same deal", async ({ page, request }) => {
  await openPayment(page, request);
  await page.getByTestId("sim-review").click();
  await page.getByTestId("sim-review-deny").click();
  const result = page.getByTestId("payment-result");
  await expect(result).toHaveAttribute("data-kind", "failure");
  await expect(result).toContainText("Payment declined");
  await page.getByTestId("retry-payment").click();
  await page.getByTestId("pay-simulated").click();
  await page.getByTestId("sim-approve").click();
  await expect(result).toHaveAttribute("data-kind", "success");
});
