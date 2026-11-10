import { cookies } from "next/headers";
import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { checkPasscode, cookieOptions, issueToken, MERCHANT_COOKIE } from "@/lib/nexus/merchant-auth";
import { recentTrustEvents, recordTrustEvent } from "@/lib/nexus/security/trust";
import { NexusError } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

const LOCKOUT_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  return handle(async () => {
    const { merchantId, passcode } = await body(req, z.object({ merchantId: z.enum(["atelier", "bolt", "cove"]), passcode: z.string().min(1).max(200) }));
    // Lockout is checked before the passcode, so guessing can't continue during it.
    if (recentTrustEvents(merchantId, ["auth-failure"], Date.now() - LOCKOUT_WINDOW_MS) >= LOCKOUT_FAILURES) {
      throw new NexusError("Too many failed sign-ins for this store. Try again in 15 minutes.", 429);
    }
    if (!checkPasscode(merchantId, passcode)) {
      recordTrustEvent(merchantId, "auth-failure", "Wrong passcode for the store workspace.");
      await store.addSecurityEvent({
        id: `sec_${crypto.randomUUID().slice(0, 12)}`,
        at: new Date().toISOString(),
        kind: "auth-failure",
        severity: "medium",
        title: "Failed store sign-in",
        detail: `Wrong passcode for ${merchantId}.`,
        ref: null,
      });
      throw new NexusError("Merchant ID or passcode is incorrect", 401);
    }
    (await cookies()).set(MERCHANT_COOKIE, issueToken(merchantId), cookieOptions());
    return { merchantId };
  });
}

export async function DELETE() {
  (await cookies()).delete(MERCHANT_COOKIE);
  return Response.json({ ok: true });
}
