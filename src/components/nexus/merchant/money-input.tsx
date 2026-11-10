"use client";

import { cn } from "cn";

/** Dollar input bound to integer cents. */
export function MoneyInput({
  cents,
  onChange,
  label,
  className,
  invalid,
  symbol = "$",
}: {
  cents: number;
  onChange: (c: number) => void;
  label: string;
  className?: string;
  invalid?: boolean;
  symbol?: string;
}) {
  return (
    <label className={cn("flex h-9 items-center gap-1 rounded-lg border bg-background px-2 text-sm focus-within:border-brand/50", invalid && "border-error/60 bg-error-soft/40", className)}>
      <span className="text-muted-foreground">{symbol}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={cents === 0 ? "0" : String(cents / 100)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(n)) onChange(Math.round(n * 100));
        }}
        className="tabular w-full min-w-0 bg-transparent outline-none"
      />
    </label>
  );
}

export function PercentInput({ value, onChange, label, max = 60 }: { value: number; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <label className="flex h-9 items-center gap-1 rounded-lg border bg-background px-2 text-sm focus-within:border-brand/50">
      <input
        aria-label={label}
        inputMode="decimal"
        value={String(Math.round(value * 1000) / 10)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(n)) onChange(Math.min(max, n) / 100);
        }}
        className="tabular w-full min-w-0 bg-transparent outline-none"
      />
      <span className="text-muted-foreground">%</span>
    </label>
  );
}
