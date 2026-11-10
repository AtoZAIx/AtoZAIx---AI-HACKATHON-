import { HeadphonesIcon, LaptopIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/lib/nexus/types";

const ICONS = { laptop: LaptopIcon, monitor: MonitorIcon, headphones: HeadphonesIcon, tablet: TabletIcon, phone: SmartphoneIcon };

/** Brand colour for the name on the tile (text only; no logos are bundled). */
const BRAND_INK: Record<string, string> = {
  Apple: "#1d1d1f",
  Samsung: "#1428a0",
  Google: "#3c4043",
  Dell: "#0067b8",
  Lenovo: "#c8102e",
  ASUS: "#00539b",
  HP: "#0071b3",
  Microsoft: "#505050",
  Acer: "#4f7f00",
  Sony: "#000000",
  Bose: "#000000",
  LG: "#a50034",
};

/**
 * Product visual. Uses a licensed photo when one is configured
 * (Product.image under /public); otherwise a clean tile with the brand name.
 */
export function ProductTile({ product, className }: { product: Product; className?: string }) {
  const ink = BRAND_INK[product.brand] ?? "#171717";
  if (product.image) {
    return (
      <div className={cn("relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={`${product.brand} ${product.name}`} className="size-full object-contain p-1.5" loading="lazy" />
      </div>
    );
  }
  const Icon = ICONS[product.category];
  return (
    <div
      className={cn("@container relative flex aspect-square flex-col items-center justify-center gap-[6%] overflow-hidden rounded-2xl border", className)}
      style={{ background: "linear-gradient(160deg, #ffffff 0%, #f1f1f4 100%)" }}
      aria-hidden
    >
      <Icon className="size-[46%]" style={{ color: ink }} strokeWidth={1.2} />
      <span className="max-w-[90%] truncate text-[max(8px,13cqw)] leading-none font-semibold tracking-tight" style={{ color: ink }}>
        {product.brand}
      </span>
    </div>
  );
}
