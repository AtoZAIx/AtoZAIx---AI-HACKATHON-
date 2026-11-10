import { z } from "zod";
import { handle } from "@/lib/nexus/http";
import { idempotent } from "@/lib/nexus/security/payment-guard";
import { capturePayment, NexusError } from "@/lib/nexus/service";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/capture">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const raw = await req.text();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new NexusError("Body must be JSON");
    }
    const { paypalOrderId } = z.object({ paypalOrderId: z.string().min(1) }).parse(json);
    return idempotent(`capture:${id}`, req.headers.get("idempotency-key"), raw, async () => ({ order: await capturePayment(id, paypalOrderId) }));
  });
}
