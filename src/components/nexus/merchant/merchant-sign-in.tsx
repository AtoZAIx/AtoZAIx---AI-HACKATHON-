"use client";

import { Loader2Icon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { MERCHANT_DIRECTORY, MERCHANT_IDS } from "@/lib/nexus/directory";
import type { MerchantId } from "@/lib/nexus/types";

export function MerchantSignIn({ devHint }: { devHint: string | null }) {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantId>("atelier");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/merchant/session", { json: { merchantId: merchant, passcode } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="surface mx-auto max-w-md space-y-5 p-6" aria-labelledby="merchant-signin">
      <div className="space-y-1.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-graphite text-white">
          <LockIcon className="size-5" />
        </span>
        <h2 id="merchant-signin" className="pt-2 text-lg font-semibold">
          Merchant sign-in
        </h2>
        <p className="text-sm text-muted-foreground">Commercial pricing, costs and budgets are confidential to each merchant and never shown to shoppers or buyer agents.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="eyebrow pb-1">Merchant</legend>
        {MERCHANT_IDS.map((id) => (
          <label key={id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3", merchant === id && "border-brand/50 bg-brand-soft/40")}>
            <input
              type="radio"
              name="merchant"
              value={id}
              checked={merchant === id}
              onChange={() => setMerchant(id)}
              className="accent-[var(--brand)]"
              aria-label={`${MERCHANT_DIRECTORY[id].name}, ${MERCHANT_DIRECTORY[id].archetype} merchant`}
            />
            <AgentAvatar id={id} size="sm" />
            <span className="text-sm font-medium">{MERCHANT_DIRECTORY[id].name}</span>
            <span className="ml-auto text-xs text-muted-foreground capitalize">{MERCHANT_DIRECTORY[id].archetype}</span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <label htmlFor="merchant-passcode" className="eyebrow block">
          Passcode
        </label>
        <input
          id="merchant-passcode"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete="current-password"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-brand/50"
          data-testid="merchant-passcode"
        />
      </div>
      {devHint && <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">{devHint}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error-ink">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={busy || !passcode}>
        {busy && <Loader2Icon className="animate-spin" />} Sign in to workspace
      </Button>
    </form>
  );
}
