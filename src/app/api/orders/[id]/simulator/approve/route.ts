import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { simulatorApprove } from "@/lib/nexus/service";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/simulator/approve">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { paypalOrderId, outcome } = await body(req, z.object({ paypalOrderId: z.string().min(1), outcome: z.enum(["approve", "review", "decline"]).optional() }));
    return { order: await simulatorApprove(id, paypalOrderId, outcome) };
  });
}
