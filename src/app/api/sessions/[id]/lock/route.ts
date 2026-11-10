import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { lockDealAndPrepareOrder } from "@/lib/nexus/service";

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/lock">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { offerId } = await body(req, z.object({ offerId: z.string().min(1) }));
    const { session, order } = await lockDealAndPrepareOrder(id, offerId);
    return { session, order };
  });
}
