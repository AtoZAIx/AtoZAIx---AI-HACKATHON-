import { body, handle } from "@/lib/nexus/http";
import { CoachBody, coachMoney } from "@/lib/nexus/money-coach";

/** Turns the browser-computed money analysis into coaching text. Nothing is stored. */
export async function POST(req: Request) {
  return handle(async () => coachMoney(await body(req, CoachBody)));
}
