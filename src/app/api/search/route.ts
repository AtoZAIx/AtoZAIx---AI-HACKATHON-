import { search } from "@/lib/nexus/feed";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await search(q.slice(0, 100)) }, { headers: { "Cache-Control": "no-store" } });
}
