import { handle } from "@/lib/nexus/http";
import { retryPayment } from "@/lib/nexus/service";

/** Try again after a declined payment: a fresh payment for the same approved deal. */
export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/retry">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { order: await retryPayment(id) };
  });
}
