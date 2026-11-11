import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** A real negotiated order, waiting for approval. */
async function pendingOrder(request: APIRequestContext) {
  const { session } = await (await request.post("/api/sessions", { data: { text: "MacBook Air 13 M4 under $1,100" } })).json();
  await (await request.post(`/api/sessions/${session.id}/negotiate`)).text();
  const { session: done } = await (await request.get(`/api/sessions/${session.id}`)).json();
  const { order } = await (await request.post(`/api/sessions/${session.id}/lock`, { data: { offerId: done.result.recommendedOfferId } })).json();
  return order as { id: string; totalCents: number };
}

/** A US-dollar Money plan with the given ENJOY (shopping) limit, saved in this browser. */
async function savePlan(page: Page, enjoyDollars: number) {
  await page.goto("/");
  await page.evaluate((enjoy) => {
    const plan = {
      v: 1,
      salaryCents: 600_000,
      currency: "USD",
      profile: { maritalStatus: "single", householdSize: 1, children: 0 },
      incomes: [{ id: "inc-salary", kind: "salary", label: "Pay", amountCents: 600_000 }],
      bills: [
        { id: "rent", name: "Rent", group: "Housing", kind: "need", amountCents: 150_000 },
        { id: "shop", name: "Shopping", group: "Shopping", kind: "want", amountCents: enjoy * 100 },
      ],
      goals: [],
      expenses: [],
      emergency: { targetMonths: 3, savedCents: 0, monthlyCents: 0 },
    };
    localStorage.setItem("nexus-money-plan-v1", JSON.stringify(plan));
  }, enjoyDollars);
}

test("Spend Guard locks approval when a purchase is over the customer's plan, until they choose to go over", async ({ page, request }) => {
  const order = await pendingOrder(request);
  await savePlan(page, 300); // far below the ~$900 MacBook
  await page.goto(`/orders/${order.id}`);
  const guard = page.getByTestId("spend-guard");
  await expect(guard).toHaveAttribute("data-verdict", "over");
  await expect(guard).toContainText("over your plan");
  await expect(page.getByTestId("spend-guard-options")).toContainText("starts again");
  await page.getByTestId("consent").check();
  await expect(page.getByTestId("approve-order")).toBeDisabled(); // the agent can't overspend
  await page.getByTestId("spend-guard-override").check();
  await expect(page.getByTestId("approve-order")).toBeEnabled(); // only the customer can
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("Spend Guard shows what's left when a purchase fits", async ({ page, request }) => {
  const order = await pendingOrder(request);
  await savePlan(page, 2_000);
  await page.goto(`/orders/${order.id}`);
  const guard = page.getByTestId("spend-guard");
  await expect(guard).toHaveAttribute("data-verdict", "fits");
  await expect(guard).toContainText("leaves");
  await expect(guard).toContainText("a day");
  await page.getByTestId("consent").check();
  await expect(page.getByTestId("approve-order")).toBeEnabled();
});
