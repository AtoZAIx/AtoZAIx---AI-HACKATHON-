"use client";

import { FingerprintIcon, KeyRoundIcon, Loader2Icon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/nexus/money";
import { passkeyStatus, passkeysSupported, setUpPasskey } from "@/lib/nexus/passkey-client";
import { STEP_UP_MIN_CENTS } from "@/lib/nexus/step-up";

export type PasskeyState = "checking" | "unsupported" | "none" | "ready";

/**
 * "Confirm it's you" before a big approval: the customer's passkey (Face ID,
 * Touch ID, fingerprint or device PIN). The first time, it's set up here.
 */
export function PasskeyStep({ reason, onState }: { reason: "amount" | "over-plan"; onState: (s: PasskeyState) => void }) {
  const [state, setState] = useState<PasskeyState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const set = (s: PasskeyState) => {
      if (!live) return;
      setState(s);
      onState(s);
    };
    if (!passkeysSupported()) set("unsupported");
    else
      passkeyStatus()
        .then((s) => set(s.registered ? "ready" : "none"))
        .catch(() => set("none"));
    return () => {
      live = false;
    };
  }, [onState]);

  async function setUp() {
    setBusy(true);
    try {
      await setUpPasskey();
      setState("ready");
      onState("ready");
      toast.success("Passkey set up on this device.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set up a passkey");
    } finally {
      setBusy(false);
    }
  }

  const why = reason === "amount" ? `Approvals of ${formatMoney(STEP_UP_MIN_CENTS)} or more need your passkey.` : "You chose to go over your plan, so we check it’s really you.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-4 text-sm" data-testid="passkey-step" data-state={state}>
      {state === "unsupported" ? <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden /> : <FingerprintIcon className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-2">
        <p>
          <b>Confirm it’s you.</b> {why} Use Face ID, Touch ID, your fingerprint or your device PIN. Your passkey never leaves this device, and the AI agents can’t use it.
        </p>
        {state === "checking" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> Checking this device…
          </p>
        )}
        {state === "ready" && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-success-ink" data-testid="passkey-ready">
            <ShieldCheckIcon className="size-3.5" aria-hidden /> Passkey ready on this device. You’ll be asked when you approve.
          </p>
        )}
        {state === "none" && (
          <Button size="sm" variant="outline" onClick={setUp} disabled={busy} data-testid="passkey-setup">
            {busy ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Set up a passkey (one time)
          </Button>
        )}
        {state === "unsupported" && (
          <p className="text-xs text-warning-ink" role="status">
            This browser can’t use passkeys. Open this page in a recent Chrome, Safari or Edge, or on your phone.
          </p>
        )}
      </div>
    </div>
  );
}
