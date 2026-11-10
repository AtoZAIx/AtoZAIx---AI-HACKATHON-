import { connection } from "next/server";
import { handle } from "@/lib/nexus/http";
import { currentMerchant } from "@/lib/nexus/merchant-auth";
import { getWorkspace } from "@/lib/nexus/merchant-workspace";
import { NexusError } from "@/lib/nexus/service";

export async function GET() {
  // Per-request and cookie-scoped: never prerendered.
  await connection();
  return handle(async () => {
    const merchantId = await currentMerchant();
    if (!merchantId) throw new NexusError("Merchant sign-in required", 401);
    return getWorkspace(merchantId);
  });
}
