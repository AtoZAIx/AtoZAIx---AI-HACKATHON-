import { handle } from "@/lib/nexus/http";
import { simulateForgedWebhook } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/simulator/forged-webhook">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const result = await simulateForgedWebhook(id);
    return { result, order: await store.getOrder(id) };
  });
}
