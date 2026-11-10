import { body, ChatBody, handle } from "@/lib/nexus/http";
import { postChat } from "@/lib/nexus/service";

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/chat">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { text, via } = await body(req, ChatBody);
    return postChat(id, text, via);
  });
}
