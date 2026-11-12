import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { simulatePaymentEvent } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

/** Simulator only: deliver a signed refund, dispute, or "review finished" webhook. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/simulator/event">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { kind } = await body(req, z.object({ kind: z.enum(["refund", "dispute", "review-complete", "review-deny"]) }));
    const result = await simulatePaymentEvent(id, kind);
    return { result, order: await store.getOrder(id) };
  });
}
