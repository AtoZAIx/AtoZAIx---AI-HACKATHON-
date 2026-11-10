"use client";

import { PayPalProvider, useEligibleMethods } from "@paypal/react-paypal-js/sdk-v6";
import { CheckIcon, Loader2Icon, MinusIcon } from "lucide-react";

const METHODS = [
  { id: "paypal", label: "PayPal balance & linked accounts" },
  { id: "paylater", label: "Pay Later" },
  { id: "venmo", label: "Venmo" },
  { id: "credit", label: "PayPal Credit" },
];

/** Asks the PayPal SDK which checkout options are eligible for this buyer. */
export function WalletEligibility({ clientId }: { clientId: string }) {
  return (
    <PayPalProvider clientId={clientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
      <Eligibility />
    </PayPalProvider>
  );
}

function Eligibility() {
  const { eligiblePaymentMethods, isLoading, error } = useEligibleMethods({ payload: { currencyCode: "USD", paymentFlow: "ONE_TIME_PAYMENT" } });
  if (isLoading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Checking eligibility with PayPal…
      </p>
    );
  if (error) return <p className="text-sm text-error-ink">PayPal eligibility check failed: {error.message}</p>;
  return (
    <ul className="divide-y rounded-xl border">
      {METHODS.map((m) => {
        const ok = Boolean(eligiblePaymentMethods?.isEligible(m.id as never));
        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            {ok ? <CheckIcon className="size-4 text-success" /> : <MinusIcon className="size-4 text-muted-foreground" />}
            <span className="flex-1">{m.label}</span>
            <span className={ok ? "text-xs font-medium text-success-ink" : "text-xs text-muted-foreground"}>{ok ? "Eligible" : "Not eligible"}</span>
          </li>
        );
      })}
    </ul>
  );
}
