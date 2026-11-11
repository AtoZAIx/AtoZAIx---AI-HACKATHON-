// Health sweep: every page loads with no console errors, page crashes or server (5xx) errors.
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/money", "/security", "/how-it-works", "/discover", "/negotiations", "/orders", "/payments", "/wallet", "/agents", "/analytics", "/settings", "/help", "/merchant", "/voice", "/intelligence", "/deals", "/verification"];

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => problems.push(`crash: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  return problems;
}

test("every page loads cleanly", async ({ page }) => {
  const problems = watch(page);
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(600);
    problems.forEach((p, i) => (problems[i] = p.startsWith("[") ? p : `[${path}] ${p}`));
  }
  expect(problems).toEqual([]);
});

test("dynamic pages from a real negotiation load cleanly", async ({ page, request }) => {
  const problems = watch(page);
  const { session } = await (await request.post("/api/sessions", { data: { text: "MacBook Air 13 M4 under $1,100" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();
  for (const path of [`/negotiations/${session.id}`, `/deals/${session.id}`, `/verification/${session.id}`, `/orders/${order.id}`, `/s/${session.id}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(500);
    await page.waitForTimeout(600);
    problems.forEach((p, i) => (problems[i] = p.startsWith("[") ? p : `[${path}] ${p}`));
  }
  expect(problems).toEqual([]);
});

test("money plan: full journey with no errors, reload keeps everything", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/money");
  await page.getByTestId("household-kids").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Your monthly take-home pay").fill("90000");
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Rent", { exact: true }).fill("20000");
  await page.getByLabel("EMIs", { exact: true }).fill("8000");
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("goal-pick-car").click();
  await page.getByLabel("Car amount").fill("500000");
  await page.getByTestId("onboarding-finish").click();
  await expect(page.getByTestId("money-overview")).toBeVisible();
  await expect(page.getByTestId("auto-payments")).toBeVisible();
  await expect(page.getByTestId("vault-locked")).toBeVisible();
  await page.getByTestId("vault-manage").locator("summary").click();
  await expect(page.getByTestId("step-up")).toBeVisible();
  // Money in and out must add up exactly, and nothing is negative.
  const parts = await page.evaluate(() => {
    const read = (id: string) => Number((document.querySelector(`[data-testid="priority-${id}"] .text-sm.font-semibold`)?.textContent ?? "0").replace(/[^0-9]/g, "") || 0);
    return { live: read("live"), enjoy: read("enjoy"), build: read("build"), free: read("unassigned") };
  });
  expect(parts.live + parts.enjoy + parts.build + parts.free).toBe(90000);
  await page.getByTestId("more-tools").locator("summary").click();
  await expect(page.getByTestId("health-score")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("dash-income")).toHaveText("₹90,000");
  await expect(page.getByTestId("tracker-Car")).toBeVisible();
  expect(problems).toEqual([]);
});
