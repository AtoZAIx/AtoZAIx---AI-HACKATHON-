import { connection } from "next/server";
import { handle } from "@/lib/nexus/http";
import { NexusError, paymentConfig } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const order = await store.getOrder(id);
    if (!order) throw new NexusError("Order not found", 404);
    return { order, payments: paymentConfig() };
  });
}
