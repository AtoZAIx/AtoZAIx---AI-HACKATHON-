import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Automated WCAG 2.1 AA scan (axe-core) of every main screen. It catches about a third of real issues, so it complements manual checks. */
const PAGES = ["/", "/money", "/security", "/how-it-works", "/discover", "/negotiations", "/orders", "/payments", "/wallet", "/agents", "/analytics", "/settings", "/help", "/merchant", "/voice"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // PayPal's own hosted buttons render in third-party iframes we don't control.
    .exclude('[id^="zoid-"]')
    .exclude('iframe[src*="paypal"]')
    .analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  // Let streamed sections and entrance animations settle before scanning.
  await page.waitForTimeout(800);
}

for (const path of PAGES) {
  test(`no WCAG 2.1 AA violations on ${path}`, async ({ page }) => {
    await open(page, path);
    expect(await violations(page)).toEqual([]);
  });
}

async function approvedOrder(request: APIRequestContext) {
  const { session } = await (await request.post("/api/sessions", { data: { text: "MacBook Air 13 M4 under $1,100" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();
  await request.post(`/api/orders/${order.id}/approve`, { data: { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion } });
  return { sessionId: session.id as string, orderId: order.id as string };
}

test("no WCAG 2.1 AA violations on a finished negotiation, its verification and its order", async ({ page, request }) => {
  const { sessionId, orderId } = await approvedOrder(request);
  for (const path of [`/negotiations/${sessionId}`, `/verification/${sessionId}`, `/orders/${orderId}`]) {
    await open(page, path);
    expect(await violations(page), path).toEqual([]);
  }
});
