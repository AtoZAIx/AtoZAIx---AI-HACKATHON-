"use client";

import { CircleCheckIcon, CircleXIcon, CreditCardIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/nexus/client";
import { formatMoney } from "@/lib/nexus/money";
import {
  amountResult,
  CARD_TYPES,
  DEFAULT_CARD_SETTINGS,
  PROCESSORS,
  RESULT_MESSAGES,
  RESULT_PLAIN,
  TEST_CARDS,
  type CardTestResult,
  type CardTestSettings,
  type CardType,
  type ProcessorId,
} from "@/lib/nexus/payments/test-cards";
import type { NexusOrder } from "@/lib/nexus/types";

function processorHint(id: ProcessorId): string {
  if (id === "payflow-simulator") return "Amounts up to $10,000 are approved; special amounts like 10422 force a result.";
  const codes = PROCESSORS.find((p) => p.id === id)!.codes;
  return `Up to $1,000 approved. $1,001–$2,000: amount − 1000 gives code ${codes.join(", ")} (anything else 12). Above $2,000 declined.`;
}

/**
 * Demo-mode card payment using PayPal's published test cards and the
 * Payflow test-transaction rules. Nothing is charged and the card number
 * and security code are never stored.
 */
export function TestCardForm({ order, ensureOrder, onOrder }: { order: NexusOrder; ensureOrder: () => Promise<string>; onOrder: (o: NexusOrder) => void }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [settings, setSettings] = useState<CardTestSettings>(DEFAULT_CARD_SETTINGS);
  const set = (patch: Partial<CardTestSettings>) => setSettings((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CardTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const predicted = amountResult(order.totalCents, settings.processor);
  const processorLabel = PROCESSORS.find((p) => p.id === settings.processor)!.label;
  const attempts = order.payment?.cardAttempts ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const paypalOrderId = await ensureOrder();
      const data = await api<{ order: NexusOrder; card: CardTestResult }>(`/api/orders/${order.id}/simulator/card`, {
        json: { paypalOrderId, number, expiry, cvv, street, zip, settings },
      });
      setResult(data.card);
      onOrder(data.order);
      if (!data.card.approved) setCvv("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card payment failed");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-brand/50";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border p-4" aria-labelledby="card-title" autoComplete="off">
      <div className="flex items-start gap-2">
        <CreditCardIcon className="mt-0.5 size-5 text-brand-ink" />
        <div>
          <h3 id="card-title" className="text-sm font-semibold">
            Pay with a test card
          </h3>
          <p className="text-xs text-muted-foreground">Demo mode: use one of PayPal’s published test card numbers. No real card is charged.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <label className="space-y-1 sm:col-span-6">
          <span className="text-xs text-muted-foreground">Card number</span>
          <input className={cn(field, "tabular tracking-wide")} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="4111 1111 1111 1111" data-testid="card-number" required />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-xs text-muted-foreground">Expiry (MMYY)</span>
          <input className={cn(field, "tabular")} inputMode="numeric" maxLength={5} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="1230" data-testid="card-expiry" required />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-xs text-muted-foreground">Security code (CVV)</span>
          <input className={cn(field, "tabular")} inputMode="numeric" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="123" data-testid="card-cvv" />
        </label>
        <label className="space-y-1 sm:col-span-4">
          <span className="text-xs text-muted-foreground">Billing street</span>
          <input className={field} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="24285 Elm" data-testid="card-street" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">ZIP</span>
          <input className={cn(field, "tabular")} inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="00382" data-testid="card-zip" />
        </label>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="card-prediction">
        For {formatMoney(order.totalCents)} on {processorLabel}: <strong>{predicted === 0 ? "Approved" : `Code ${predicted}, ${RESULT_MESSAGES[predicted] ?? "Declined"}`}</strong> (if the card and expiry are valid).
      </p>

      <details className="rounded-xl border px-3 py-2 text-sm" data-testid="card-settings">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Test settings · {processorLabel}
          {settings.acceptedTypes.length < CARD_TYPES.length ? " · some cards not accepted" : ""}
          {settings.declineOnCvvMismatch ? " · CVV decline" : ""}
          {settings.avsDeny ? " · AVS Deny" : ""}
          {settings.accountUpdater ? " · Account Updater" : ""}
        </summary>
        <div className="space-y-4 py-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Processor</span>
            <select
              value={settings.processor}
              onChange={(e) => set({ processor: e.target.value as ProcessorId })}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-brand/50"
              data-testid="card-processor"
            >
              {PROCESSORS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">{processorHint(settings.processor)}</span>
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-xs text-muted-foreground">Card types this store accepts (others return code 25)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {CARD_TYPES.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={settings.acceptedTypes.includes(c.id)}
                    onChange={(e) =>
                      set({ acceptedTypes: e.target.checked ? [...settings.acceptedTypes, c.id] : settings.acceptedTypes.filter((t: CardType) => t !== c.id) })
                    }
                    data-testid={`accept-${c.id}`}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Toggle checked={settings.declineOnCvvMismatch} onChange={(v) => set({ declineOnCvvMismatch: v })} testId="cvv-decline" label="Decline when the security code doesn’t match" hint="Some processors return code 12 instead of CVV2MATCH=N." />
            <Toggle checked={settings.avsDeny} onChange={(v) => set({ avsDeny: v })} testId="avs-deny" label="AVS Deny" hint="A failed address check returns code 112." />
            <Toggle
              checked={settings.accountUpdater}
              onChange={(v) => set({ accountUpdater: v })}
              testId="account-updater"
              label="Litle Account Updater"
              hint="Replaces outdated card details: $500–$999.99 both, $400–$499.99 card number, $300–$399.99 expiry."
            />
          </div>
        </div>
      </details>

      {result && (
        <div
          role="status"
          data-testid="card-result"
          className={cn("flex gap-3 rounded-xl p-3 text-sm", result.approved ? "bg-success-soft text-success-ink" : "bg-error-soft text-error-ink")}
        >
          {result.approved ? <CircleCheckIcon className="size-5 shrink-0" /> : <CircleXIcon className="size-5 shrink-0" />}
          <div>
            <p className="font-medium">{RESULT_PLAIN[result.result] ?? result.respmsg}</p>
            {result.ccUpdated && (
              <p className="text-xs">
                Account Updater refreshed the card{result.updatedLast4 ? `: now ending ${result.updatedLast4}` : ""}
                {result.updatedExpiry ? `${result.updatedLast4 ? "," : ":"} expiry ${result.updatedExpiry}` : ""}.
              </p>
            )}
            <p className="font-mono text-[11px] opacity-80">
              RESULT {result.result} · {result.respmsg} · CVV2MATCH={result.cvv2Match ?? "-"} · AVSADDR={result.avsAddr ?? "-"} · AVSZIP={result.avsZip ?? "-"}
              {result.ccUpdated ? ` · CCUPDATED=Y${result.updatedLast4 ? ` ACCT=…${result.updatedLast4}` : ""}${result.updatedExpiry ? ` EXPDATE=${result.updatedExpiry}` : ""}` : ""}
            </p>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-error-soft p-3 text-sm text-error-ink">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy || !number || !expiry} data-testid="card-submit">
        {busy ? <Loader2Icon className="animate-spin" /> : <CreditCardIcon />} Pay {formatMoney(order.totalCents)} by card
      </Button>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Test card numbers and how to trigger results</summary>
        <div className="mt-2 space-y-3">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {TEST_CARDS.map((c) => (
              <li key={c.number}>
                <button
                  type="button"
                  onClick={() => {
                    setNumber(c.number);
                    if (!expiry) setExpiry("1230");
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-secondary"
                >
                  <span>
                    {c.brand}
                    {c.hsaFsa && <span className="text-muted-foreground"> · Paymentech Salem only</span>}
                  </span>
                  <span className="tabular font-mono">{c.number}</span>
                </button>
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-muted-foreground">
            <li>Any other card number returns code 23 (invalid account number). A past expiry returns code 24.</li>
            <li>A card type the store doesn’t accept, or an HSA/FSA card on any processor except Paymentech Salem, returns code 25.</li>
            <li>Account Updater test cards: 4111…1111 → …4321, 4012…1881 → …0026, 5105…5100 → …5454, 5560…8244 → …5100. Expiry 0000 → 0919, 1213 → 1218, 0120 → 0150, 0230 → 0250, 0340 → 0350.</li>
            <li>CVV: 000–300 matches (Y), 301–600 doesn’t match (N), 601+ not checked (X).</li>
            <li>Street starting 000–333 matches (Y), 334–666 doesn’t (N), 667+ or a letter is not checked (X).</li>
            <li>ZIP 00000–50000 matches (Y), 50001–99999 doesn’t (N).</li>
          </ul>
        </div>
      </details>

      {attempts.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Card attempts on this order</p>
          <ul className="space-y-1 text-xs">
            {attempts
              .slice(-3)
              .reverse()
              .map((a) => (
                <li key={a.at} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-2 py-1">
                  <span>
                    {a.brand ?? "Unknown card"} ending {a.last4}
                  </span>
                  <span className={a.approved ? "font-medium text-success-ink" : "font-medium text-error-ink"}>
                    {a.approved ? "Approved" : `Code ${a.result}`}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </form>
  );
}

function Toggle({ checked, onChange, label, hint, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; testId: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>
        <span className="block">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
