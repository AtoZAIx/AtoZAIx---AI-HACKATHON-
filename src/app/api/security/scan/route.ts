import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { screenPrompt } from "@/lib/nexus/security/prompt-shield";

/** Try the AI firewall on any text. A test only: nothing is logged or sent to an agent. */
export async function POST(req: Request) {
  return handle(async () => {
    const { text } = await body(req, z.object({ text: z.string().min(1).max(2000) }));
    return screenPrompt(text);
  });
}
