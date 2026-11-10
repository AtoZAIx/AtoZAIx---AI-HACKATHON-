import { body, ChatBody, deviceFrom, handle } from "@/lib/nexus/http";
import { createSession } from "@/lib/nexus/service";

export async function POST(req: Request) {
  return handle(async () => {
    const { text, via, budgetCents } = await body(req, ChatBody);
    return createSession(text, via, { budgetCents, deviceId: deviceFrom(req) });
  });
}
