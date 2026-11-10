import { connection } from "next/server";
import { notifications } from "@/lib/nexus/feed";

export async function GET() {
  await connection();
  return Response.json({ notifications: await notifications() }, { headers: { "Cache-Control": "no-store" } });
}
