import "server-only";
import { z } from "zod";
import { PaymentError } from "./payments/gateway";
import { IdempotencyError } from "./security/payment-guard";
import { NexusError } from "./service";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
    if (err instanceof NexusError || err instanceof PaymentError || err instanceof IdempotencyError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[nexus]", err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new NexusError("Body must be JSON");
  }
  return schema.parse(json);
}

export const ChatBody = z.object({
  text: z.string().min(1).max(1000),
  via: z.enum(["chat", "voice"]).optional(),
  /** Spending limit from the command bar, in cents. */
  budgetCents: z.number().int().positive().max(10_000_000).nullable().optional(),
});

/** The anonymous device ID header, if well-formed. Used only as a fraud signal. */
export function deviceFrom(req: Request): string | null {
  const v = req.headers.get("x-nexus-device");
  return v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}
