import { connection } from "next/server";
import { geminiEnabled, geminiModel } from "@/lib/nexus/gemini";
import { paymentConfig } from "@/lib/nexus/service";

export async function GET() {
  await connection();
  return Response.json({
    payments: paymentConfig(),
    ai: { gemini: geminiEnabled(), model: geminiEnabled() ? geminiModel() : null },
  });
}
