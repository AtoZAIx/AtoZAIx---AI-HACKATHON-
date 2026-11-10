import { body, handle } from "@/lib/nexus/http";
import { currentMerchant } from "@/lib/nexus/merchant-auth";
import { ConfigBody, saveConfig } from "@/lib/nexus/merchant-workspace";
import { NexusError } from "@/lib/nexus/service";

export async function PUT(req: Request) {
  return handle(async () => {
    const merchantId = await currentMerchant();
    if (!merchantId) throw new NexusError("Merchant sign-in required", 401);
    return saveConfig(merchantId, await body(req, ConfigBody));
  });
}
