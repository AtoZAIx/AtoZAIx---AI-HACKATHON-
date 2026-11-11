import { expect, type Page } from "@playwright/test";

/**
 * Gives the browser a virtual passkey device (Chrome's WebAuthn emulation):
 * it behaves like Face ID or a fingerprint that always succeeds.
 */
export async function addPasskeyDevice(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

/** When the approval asks for a passkey, sets one up first (the one-time step). */
export async function passkeyIfAsked(page: Page) {
  const step = page.getByTestId("passkey-step");
  if (!(await step.isVisible())) return false;
  await expect(step).not.toHaveAttribute("data-state", "checking");
  if ((await step.getAttribute("data-state")) === "none") {
    await page.getByTestId("passkey-setup").click();
    await expect(page.getByTestId("passkey-ready")).toBeVisible();
    // Let the "Passkey set up" toast finish fading in, so accessibility scans see its real colours.
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Passkey set up" });
    await expect(toast).toHaveAttribute("data-mounted", "true");
    await expect.poll(() => toast.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  }
  return true;
}
