import { processWebhook } from "@/lib/nexus/service";

/** PayPal webhook receiver. Signature is verified before anything is trusted. */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const { status, detail } = await processWebhook(req.headers, raw);
    return Response.json({ detail }, { status });
  } catch (err) {
    console.error("[webhook]", err);
    return Response.json({ detail: "Webhook processing failed" }, { status: 500 });
  }
}
