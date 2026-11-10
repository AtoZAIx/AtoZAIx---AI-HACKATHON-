import { store } from "@/lib/nexus/store";

/** Resets demo data (sessions, orders, stock). Disabled in production unless explicitly allowed. */
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.NEXUS_ALLOW_RESET !== "1") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  await store.reset();
  return Response.json({ ok: true });
}
