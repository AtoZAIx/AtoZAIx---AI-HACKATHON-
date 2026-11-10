"use client";

import { createContext, useContext } from "react";
import { MoneyInput } from "@/components/nexus/merchant/money-input";
import type { CurrencyCode } from "@/lib/nexus/budget";
import { currencySymbol, formatAmount } from "@/lib/nexus/household";

const CurrencyContext = createContext<CurrencyCode>("USD");

export const CurrencyProvider = CurrencyContext.Provider;

/** Formats amounts in the plan's currency (₹ with lakh grouping for INR). */
export function useFmt() {
  const code = useContext(CurrencyContext);
  return (cents: number) => formatAmount(cents, code);
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

/** A money input showing the plan's currency symbol. */
export function CurrencyInput(props: Omit<Parameters<typeof MoneyInput>[0], "symbol">) {
  const code = useContext(CurrencyContext);
  return <MoneyInput {...props} symbol={currencySymbol(code)} />;
}
