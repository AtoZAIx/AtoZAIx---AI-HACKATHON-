import { deviceFrom, handle } from "@/lib/nexus/http";
import { idempotent } from "@/lib/nexus/security/payment-guard";
import { startPayment } from "@/lib/nexus/service";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/pay">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const raw = await req.text();
    // Optional: { confirmRisk: true } after the shopper confirms a flagged payment.
    let input: { confirmRisk?: unknown } = {};
    try {
      input = raw ? JSON.parse(raw) : {};
    } catch {
      input = {};
    }
    return idempotent(`pay:${id}`, req.headers.get("idempotency-key"), raw, () =>
      startPayment(id, new URL(req.url).origin, { confirmRisk: input?.confirmRisk === true, deviceId: deviceFrom(req) }),
    );
  });
}
