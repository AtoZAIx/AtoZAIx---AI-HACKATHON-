import { z } from "zod";
import { PRODUCTS } from "@/lib/nexus/catalog";
import { generateJson, geminiEnabled } from "@/lib/nexus/gemini";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Product photo → purchase request. Requires Gemini; without it this says so
 * rather than guessing.
 */
export async function POST(req: Request) {
  if (!geminiEnabled()) {
    return Response.json({ error: "Image recognition needs GEMINI_API_KEY. Pick a product from the catalogue instead." }, { status: 501 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Attach an image" }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPEG, PNG or WebP image" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image must be under 4 MB" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const ids = PRODUCTS.map((p) => p.id);
  const res = await generateJson({
    label: "vision",
    system:
      "Identify the consumer electronics product in the photo. Pick the closest catalogue product id only if it is clearly the same kind of product; otherwise use none. Write a short purchase request a shopper would type.",
    prompt: JSON.stringify({ catalogue: PRODUCTS.map((p) => ({ id: p.id, name: p.name, category: p.category, description: p.description })) }),
    media: { mimeType: file.type, base64 },
    schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["laptop", "monitor", "headphones", "tablet", "phone", "other"] },
        productId: { type: "string", enum: [...ids, "none"] },
        description: { type: "string" },
        suggestedRequest: { type: "string" },
      },
      required: ["category", "productId", "description", "suggestedRequest"],
    },
    validate: (v) =>
      z
        .object({
          category: z.enum(["laptop", "monitor", "headphones", "tablet", "phone", "other"]),
          productId: z.string(),
          description: z.string().max(300),
          suggestedRequest: z.string().max(300),
        })
        .parse(v),
    temperature: 0.2,
    timeoutMs: 15000,
  });
  if (!res) return Response.json({ error: "Couldn't recognise the product. Try another photo or describe it." }, { status: 422 });
  const product = PRODUCTS.find((p) => p.id === res.productId) ?? null;
  return Response.json({
    category: res.category,
    product: product ? { id: product.id, name: product.name } : null,
    description: res.description,
    suggestedRequest: res.suggestedRequest,
  });
}
