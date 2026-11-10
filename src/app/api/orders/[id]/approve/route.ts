import { z } from "zod";
import { handle } from "@/lib/nexus/http";
import { idempotent } from "@/lib/nexus/security/payment-guard";
import { approveOrder, NexusError } from "@/lib/nexus/service";

const Body = z.object({ termsHash: z.string().length(64), amountCents: z.number().int().positive(), agreementVersion: z.number().int().positive() });

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
    return idempotent(`approve:${id}`, req.headers.get("idempotency-key"), raw, async () => ({ order: await approveOrder(id, input) }));
  });
}
