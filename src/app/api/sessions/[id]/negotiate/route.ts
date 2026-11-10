import { NexusError, streamNegotiation } from "@/lib/nexus/service";
import { store } from "@/lib/nexus/store";

/** Streams negotiation protocol events as NDJSON while the agents run. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/negotiate">) {
  const { id } = await ctx.params;
  const session = await store.getSession(id);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (!session.intent) return Response.json({ error: "Tell the buyer agent what you want first" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamNegotiation(id, req.signal)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        const error = err instanceof NexusError ? err.message : "Negotiation failed";
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error })}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
