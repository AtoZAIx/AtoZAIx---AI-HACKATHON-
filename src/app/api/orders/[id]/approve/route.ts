import { cookies } from "next/headers";
import { z } from "zod";
import { handle } from "@/lib/nexus/http";
import { CHALLENGE_COOKIE, cookieOptions, PASSKEY_COOKIE, publicOrigin, seal, unseal, verifyApproval, type StoredPasskey } from "@/lib/nexus/security/passkey";
import { idempotent } from "@/lib/nexus/security/payment-guard";
import { approveOrder, NexusError } from "@/lib/nexus/service";

const b64u = z.string().regex(/^[A-Za-z0-9_-]+$/).max(8192);
const Body = z.object({
  termsHash: z.string().length(64),
  amountCents: z.number().int().positive(),
  agreementVersion: z.number().int().positive(),
  /** Passkey check for this exact order (needed for $1,000 or more). */
  passkey: z.object({ id: b64u, clientDataJSON: b64u, authenticatorData: b64u, signature: b64u }).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/approve">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const raw = await req.text();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new NexusError("Body must be JSON");
    }
    const input = Body.parse(json);
    let stepUp: "passkey" | undefined;
    if (input.passkey) {
      // Verified here, on the server: the signature, this device's key, and that the check was for exactly this order, amount and terms.
      const origin = publicOrigin(req);
      const jar = await cookies();
      const stored = unseal<StoredPasskey>(jar.get(PASSKEY_COOKIE)?.value);
      const { counter } = verifyApproval({
        challengeToken: jar.get(CHALLENGE_COOKIE)?.value,
        passkey: stored,
        response: input.passkey,
        origin,
        expect: { orderId: id, amountCents: input.amountCents, termsHash: input.termsHash },
      });
      jar.delete(CHALLENGE_COOKIE);
      jar.set(PASSKEY_COOKIE, seal({ ...stored!, counter }), cookieOptions(origin, 60 * 60 * 24 * 365));
      stepUp = "passkey";
    }
    const terms = { termsHash: input.termsHash, amountCents: input.amountCents, agreementVersion: input.agreementVersion };
    return idempotent(`approve:${id}`, req.headers.get("idempotency-key"), raw, async () => ({ order: await approveOrder(id, terms, { stepUp }) }));
  });
}
