"use client";

import { ArrowRightIcon, ImageIcon, LayoutGridIcon, Loader2Icon, MicIcon, UploadIcon, WalletIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/nexus/client";
import type { CommerceSession, Product } from "@/lib/nexus/types";
import { ProductPicker } from "./product-picker";

const SUGGESTIONS = [
  { label: "Find the best laptop under $900.", text: "Find the best laptop under $900" },
  { label: "Compare wireless headphones.", text: "Compare wireless headphones" },
  { label: "Find a smartphone with the best warranty.", text: "Find a smartphone with the best warranty" },
  { label: "Negotiate a better price for a product.", text: null },
  { label: "MacBook Air for school under $1,100.", text: "MacBook Air for school under $1,100" },
  { label: "Best price on iPhone 17 Pro.", text: "Best price on iPhone 17 Pro" },
  { label: "Ask for 10% off a MacBook Air.", text: "MacBook Air 13 M4, 10% off" },
];

type ChatResponse = { session: CommerceSession; action: { type: string } };

/** The central command bar: describe, speak, show or pick what to buy. */
export function NexusCommandInput({ defaultLimit }: { defaultLimit?: number | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(defaultLimit ? String(defaultLimit / 100) : "");
  const [busy, setBusy] = useState(false);
  const [vision, setVision] = useState<"idle" | "reading" | "unavailable">("idle");
  const [picker, setPicker] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const limitCents = (() => {
    const n = Number(limit.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  })();

  async function start(value: string) {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const { session, action } = await api<ChatResponse>("/api/sessions", { json: { text: v, via: "chat", budgetCents: limitCents } });
      router.push(`/negotiations/${session.id}${action.type === "negotiate" ? "?go=1" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start");
      setBusy(false);
    }
  }

  async function upload(f: File) {
    setVision("reading");
    try {
      const form = new FormData();
      form.append("image", f);
      const res = await fetch("/api/vision", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; suggestedRequest?: string; description?: string };
      if (res.status === 501) {
        setVision("unavailable");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the image");
      setText(data.suggestedRequest ?? "");
      toast.success(data.description ? `Recognised: ${data.description}` : "Product recognised");
      setVision("idle");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read the image");
      setVision("idle");
    }
  }

  const choose = (p: Product) => setText(`Negotiate the best price for the ${p.name}`);

  return (
    <div className="space-y-4">
      <form
        className="surface overflow-hidden p-0 shadow-raised transition focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/10"
        onSubmit={(e) => {
          e.preventDefault();
          void start(text);
        }}
      >
        <label htmlFor="command" className="sr-only">
          What would you like to buy?
        </label>
        <textarea
          id="command"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void start(text);
            }
          }}
          rows={2}
          placeholder="e.g. a MacBook Air under $1,000, or the best price on an iPhone 17…"
          className="field-sizing-content block max-h-48 min-h-20 w-full resize-none bg-transparent px-5 pt-5 pb-2 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground/80"
          data-testid="command-input"
        />
        {vision === "unavailable" && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-ink">
            Image recognition needs a Gemini API key on the server.
            <button type="button" className="font-semibold underline" onClick={() => setPicker(true)}>
              Choose from catalogue
            </button>
            <button type="button" className="ml-auto" aria-label="Dismiss" onClick={() => setVision("idle")}>
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t bg-background/60 px-3 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" className="h-9 rounded-xl" aria-label="Speak your request">
                <Link href="/voice">
                  <MicIcon /> Speak
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Say what you want instead of typing</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-9 rounded-xl" aria-label="Add a product photo" disabled={vision === "reading"}>
                {vision === "reading" ? <Loader2Icon className="animate-spin" /> : <ImageIcon />} Photo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => file.current?.click()}>
                <UploadIcon /> Upload a product photo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPicker(true)}>
                <LayoutGridIcon /> Choose from catalogue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <label className={cn("flex h-9 items-center gap-1.5 rounded-xl border bg-card px-2.5 text-sm", limitCents && "border-brand/40")}>
            <WalletIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Budget</span>
            <span className="text-muted-foreground">$</span>
            <input
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="any"
              className="tabular w-16 bg-transparent outline-none"
              aria-label="Spending limit in US dollars"
              data-testid="spending-limit"
            />
          </label>
          <Button type="submit" size="lg" className="ml-auto h-10 rounded-xl px-4" disabled={busy || !text.trim()} data-testid="command-submit">
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Find deals <ArrowRightIcon />
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Suggested requests">
        <span className="text-xs text-muted-foreground">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={busy}
            onClick={() => (s.text ? void start(s.text) : setPicker(true))}
            className="h-8 rounded-full border bg-card px-3.5 text-[13px] text-muted-foreground shadow-card transition hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>
      <ProductPicker open={picker} onOpenChange={setPicker} onSelect={choose} />
    </div>
  );
}
