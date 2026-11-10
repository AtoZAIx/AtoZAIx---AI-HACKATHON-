import type { CommerceSession, NexusOrder } from "./types";

/** The five steps every purchase goes through, in plain words. */
export const JOURNEY = [
  { id: "ask", label: "Tell us", long: "Tell us what you need" },
  { id: "negotiate", label: "Agents negotiate", long: "AI agents ask 3 stores for their best price" },
  { id: "choose", label: "Pick a deal", long: "Pick the deal you like" },
  { id: "pay", label: "Approve & pay", long: "Approve the price and pay with PayPal" },
  { id: "done", label: "Done", long: "Order confirmed" },
] as const;

export type JourneyStep = (typeof JOURNEY)[number]["id"];

export function journeyStep(session: Pick<CommerceSession, "intent" | "result" | "status" | "agreement"> | null, order: Pick<NexusOrder, "status"> | null): JourneyStep {
  if (order && ["confirmed", "refunded", "disputed"].includes(order.status)) return "done";
  if (order && order.status !== "cancelled") return "pay";
  if (session?.result) return "choose";
  if (session?.intent) return "negotiate";
  return "ask";
}

export interface NextAction {
  label: string;
  href: string;
  /** Plain-language status of where this purchase is. */
  status: string;
}

/** What the shopper should do next for a given request. */
export function nextAction(session: CommerceSession, order: NexusOrder | null): NextAction {
  const step = journeyStep(session, order);
  const deal = `/negotiations/${session.id}`;
  switch (step) {
    case "done":
      return order!.status === "confirmed"
        ? { label: "View order", href: `/orders/${order!.id}`, status: "Paid and confirmed" }
        : { label: "View order", href: `/orders/${order!.id}`, status: order!.status === "refunded" ? "Refunded" : "Payment disputed" };
    case "pay":
      return order!.status === "awaiting_approval"
        ? { label: "Approve & pay", href: `/orders/${order!.id}`, status: "Waiting for your approval" }
        : order!.status === "payment_failed"
          ? { label: "See what happened", href: `/orders/${order!.id}`, status: "Payment didn't go through" }
          : { label: "Finish payment", href: `/orders/${order!.id}`, status: "Payment in progress" };
    case "choose":
      return { label: "Pick a deal", href: deal, status: `${session.result!.ranking.length} offers ready` };
    case "negotiate":
      return session.status === "negotiating"
        ? { label: "Watch live", href: deal, status: "Agents are negotiating" }
        : { label: "Continue", href: deal, status: "Ready to negotiate" };
    default:
      return { label: "Continue", href: deal, status: "Tell your agent what you need" };
  }
}
