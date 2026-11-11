import { cookies } from "next/headers";
import { handle } from "@/lib/nexus/http";
import { approvalOptions, CHALLENGE_COOKIE, cookieOptions, newChallenge, PASSKEY_COOKIE, PasskeyError, publicOrigin, unseal, type StoredPasskey } from "@/lib/nexus/security/passkey";
import { getOrder } from "@/lib/nexus/service";

/** A passkey check bound to this order's exact amount and terms. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/approve/options">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const order = await getOrder(id);
    const origin = publicOrigin(req);
    const jar = await cookies();
    const passkey = unseal<StoredPasskey>(jar.get(PASSKEY_COOKIE)?.value);
    if (!passkey) throw new PasskeyError("Set up a passkey on this device first.");
    const { challenge, token } = newChallenge("approve", { orderId: order.id, amountCents: order.totalCents, termsHash: order.termsHash });
    jar.set(CHALLENGE_COOKIE, token, cookieOptions(origin, 300));
    return { options: approvalOptions(origin, challenge, passkey) };
  });
}
