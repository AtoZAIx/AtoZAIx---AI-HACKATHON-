import { expect, test, type Page } from "@playwright/test";
import { addPasskeyDevice, passkeyIfAsked } from "./passkey-helper";

test.beforeEach(async ({ request, page }) => {
  expect((await request.post("/api/dev/reset")).ok()).toBe(true);
  await addPasskeyDevice(page); // Big approvals ask for a passkey: this device has one, like Face ID.
});

async function startFromDashboard(page: Page, text: string, limit?: string) {
  await page.goto("/");
  if (limit) await page.getByTestId("spending-limit").fill(limit);
  await page.getByTestId("command-input").fill(text);
  await page.getByTestId("command-submit").click();
  await expect(page).toHaveURL(/\/negotiations\/ses_/);
}

async function waitForOffers(page: Page) {
  // The room switches to the offers panel when the stream completes.
  await expect(page.locator('[data-testid^="offer-"]', { hasText: "Recommended" })).toBeVisible({ timeout: 60_000 });
}

test("dashboard → live negotiation → verify → approve → pay → payment verified", async ({ page }) => {
  await startFromDashboard(page, "Lightweight laptop for programming with 16GB RAM", "1300");
  await waitForOffers(page);
  await expect(page.getByRole("region", { name: "What you asked for" })).toContainText("$1,300");
  await expect(page.getByRole("navigation", { name: "Purchase progress" })).toBeVisible();

  const recommended = page.locator('[data-testid^="offer-"]', { hasText: "Recommended" });
  await recommended.getByRole("button", { name: "Choose this deal" }).click();
  await expect(page.getByRole("region", { name: "Deal locked" })).toContainText("All safety checks passed");
  await page.getByTestId("review-order").click();

  await expect(page).toHaveURL(/\/orders\/ord_/);
  await expect(page.getByRole("heading", { name: "Approve the exact terms" })).toBeVisible();
  const total = (await page.getByTestId("order-total").textContent())!.split(" ")[0].trim();
  await expect(page.getByTestId("approve-order")).toBeDisabled();
  await page.getByTestId("consent").check();
  await passkeyIfAsked(page);
  await page.getByTestId("approve-order").click();

  await page.getByTestId("pay-simulated").click();
  await expect(page.getByRole("dialog")).toContainText(total);
  await page.getByTestId("sim-approve").click();
  await expect(page.getByTestId("order-confirmed")).toBeVisible();

  await page.getByRole("link", { name: /See payment details/ }).click();
  await expect(page).toHaveURL(/\/payments\/ord_/);
  await expect(page.locator('[data-check="webhook"][data-status="pass"]')).toBeVisible();
  await expect(page.locator('[data-status="fail"]')).toHaveCount(0);

  await page.getByTestId("forge-webhook").click();
  await expect(page.getByText("Blocked a fake PayPal message", { exact: true })).toBeVisible();
  await page.getByTestId("sim-refund").click();
  await expect(page.getByText("REFUNDED", { exact: true })).toBeVisible();

  await page.goto("/orders?status=refunded");
  await expect(page.locator("[data-order]")).toHaveCount(1);
  await page.goto("/orders?status=confirmed");
  await expect(page.locator("[data-order]")).toHaveCount(0);
});

test("chat picks a merchant by name and the verification dashboard shows evidence", async ({ page }) => {
  await startFromDashboard(page, "noise cancelling headphones for travel under $400");
  await waitForOffers(page);
  const chat = page.getByRole("textbox", { name: "Message the buyer agent" });
  await chat.fill("go with Cove");
  await chat.press("Enter");
  await expect(page.getByTestId("chat-log")).toContainText("Locked with Cove Commerce");

  const id = page.url().split("/negotiations/")[1].split("?")[0];
  await page.goto(`/verification/${id}`);
  await expect(page.getByText("All safety checks passed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your deal" })).toContainText("Version 1");
  await page.getByText("Technical details").first().click();
});

test("merchant workspace requires sign-in and its API rejects shoppers", async ({ page, request }) => {
  expect((await request.get("/api/merchant/workspace")).status()).toBe(401);
  expect((await request.put("/api/merchant/config", { data: {} })).status()).toBe(401);

  await page.goto("/merchant");
  await expect(page.getByRole("heading", { name: "Merchant sign-in" })).toBeVisible();
  await page.getByRole("radio", { name: /Vantage Market/ }).check();
  await page.getByLabel("Passcode").fill("wrong");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await page.getByLabel("Passcode").fill("nexus-dev");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.getByRole("heading", { name: "Commercial pricing configuration" })).toBeVisible();
  await expect(page.getByText("Confidential: costs, margins")).toBeVisible();
});

test("voice page offers voice or an honest fallback", async ({ page }) => {
  await page.goto("/voice");
  await expect(page.getByTestId("voice-experience")).toBeVisible();
  const mic = page.getByTestId("voice-mic");
  const fallback = page.getByText("Voice recognition isn’t available in this browser");
  await expect(mic.or(fallback)).toBeVisible();
});

test("no page scrolls horizontally", async ({ page }) => {
  for (const path of ["/", "/money", "/security", "/how-it-works", "/discover", "/agents", "/negotiations", "/deals", "/verification", "/orders", "/wallet", "/payments", "/analytics", "/settings", "/help", "/merchant", "/voice"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("pay by test card: a bad number is declined, a test Visa goes through", async ({ page }) => {
  await startFromDashboard(page, "noise cancelling headphones for travel under $400");
  await waitForOffers(page);
  const recommended = page.locator('[data-testid^="offer-"]', { hasText: "Recommended" });
  await recommended.getByRole("button", { name: "Choose this deal" }).click();
  await page.getByTestId("review-order").click();
  await page.getByTestId("consent").check();
  await passkeyIfAsked(page);
  await page.getByTestId("approve-order").click();

  await page.getByTestId("pay-card").click();
  await expect(page.getByTestId("card-prediction")).toContainText("Approved");
  await page.getByTestId("card-number").fill("4000 0000 0000 0002");
  await page.getByTestId("card-expiry").fill("1230");
  await page.getByTestId("card-submit").click();
  await expect(page.getByTestId("card-result")).toContainText("isn’t valid");
  await expect(page.getByTestId("card-result")).toContainText("RESULT 23");

  await page.getByTestId("card-settings").locator("summary").click();
  await page.getByTestId("accept-visa").uncheck();
  await page.getByTestId("card-number").fill("4111 1111 1111 1111");
  await page.getByTestId("card-submit").click();
  await expect(page.getByTestId("card-result")).toContainText("RESULT 25");
  await expect(page.getByTestId("card-result")).toContainText("doesn’t accept");
  await page.getByTestId("accept-visa").check();

  await page.getByTestId("card-cvv").fill("123");
  await page.getByTestId("card-street").fill("24285 Elm");
  await page.getByTestId("card-zip").fill("00382");
  await page.getByTestId("card-submit").click();
  await expect(page.getByTestId("order-confirmed")).toBeVisible();
  await expect(page.getByLabel("What happened")).toContainText("Card declined");
  await expect(page.getByLabel("What happened")).toContainText("Card approved");
});

test("naming a discount gets a mutual deal from every store", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ask for 10% off a MacBook Air." }).click();
  await expect(page).toHaveURL(/\/negotiations\/ses_/);
  await waitForOffers(page);
  await expect(page.getByText("Discount you asked for")).toBeVisible();
  const lines = page.locator('[data-testid^="mutual-"]');
  await expect(lines.first()).toContainText("you asked for 10%");
  // Every store settled below the ask: halfway between its opening and the ask, within its limit.
  for (const text of await lines.allTextContents()) {
    const agreed = Number(/^([\d.]+)% off/.exec(text)?.[1]);
    expect(agreed).toBeGreaterThan(0);
    expect(agreed).toBeLessThan(10);
  }
});

test("the 50/30/25 example: a clearance item, a 30% ask, closes at 25%", async ({ page }) => {
  await startFromDashboard(page, "Bose QuietComfort Ultra, 30% off");
  await waitForOffers(page);
  await expect(page.getByTestId("mutual-cove")).toHaveText("25% off · you asked for 30%");
});
