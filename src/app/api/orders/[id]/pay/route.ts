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
      startPayment(id, publicOrigin(req), { confirmRisk: input?.confirmRisk === true, deviceId: deviceFrom(req) }),
    );
  });
}

/**
 * The public address PayPal sends the buyer back to. Behind a hosting proxy
 * (Render), the request can look like http:// or an internal host, so the
 * configured public URL wins: APP_URL, then Render's RENDER_EXTERNAL_URL.
 */
function publicOrigin(req: Request): string {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured && /^https?:\/\/[^/\s]+$/.test(configured.replace(/\/+$/, ""))) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}
