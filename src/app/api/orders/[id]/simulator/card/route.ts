import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { CARD_TYPES, DEFAULT_CARD_SETTINGS, PROCESSORS } from "@/lib/nexus/payments/test-cards";
import { simulatorPayByCard } from "@/lib/nexus/service";

const processorIds = PROCESSORS.map((p) => p.id) as [string, ...string[]];
const cardTypeIds = CARD_TYPES.map((c) => c.id) as [string, ...string[]];

const CardBody = z.object({
  paypalOrderId: z.string().min(1),
  number: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{12,19}$/, "Card number must be 12–19 digits")),
  expiry: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{4}$/, "Expiry must be MMYY")),
  cvv: z.string().regex(/^\d{3,4}$/, "Security code must be 3 or 4 digits").optional().or(z.literal("")),
  street: z.string().max(100).optional(),
  zip: z.string().max(10).optional(),
  settings: z
    .object({
      processor: z.enum(processorIds),
      acceptedTypes: z.array(z.enum(cardTypeIds)),
      declineOnCvvMismatch: z.boolean(),
      avsDeny: z.boolean(),
      accountUpdater: z.boolean(),
    })
    .default(DEFAULT_CARD_SETTINGS),
});

/** Demo mode only: pay with a published test card. Card data is never stored or logged. */
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/simulator/card">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { paypalOrderId, settings, ...card } = await body(req, CardBody);
    return simulatorPayByCard(id, paypalOrderId, {
      ...card,
      cvv: card.cvv || undefined,
      settings: settings as typeof DEFAULT_CARD_SETTINGS,
    });
  });
}
