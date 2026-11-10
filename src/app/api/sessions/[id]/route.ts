import { connection } from "next/server";
import { handle } from "@/lib/nexus/http";
import { NexusError } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const session = await store.getSession(id);
    if (!session) throw new NexusError("Session not found", 404);
    const order = session.orderId ? await store.getOrder(session.orderId) : null;
    return { session, order };
  });
}
