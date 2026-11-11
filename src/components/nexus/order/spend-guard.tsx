"use client";

import { ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useMoneyPlan } from "@/components/nexus/money/use-money-plan";
import type { Purchase } from "@/lib/nexus/budget";
import { formatAmount } from "@/lib/nexus/household";
import { formatMoney } from "@/lib/nexus/money";
import { checkPurchase, needsOverride, type PurchaseToCheck } from "@/lib/nexus/spend-guard";

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Spend Guard on the approval screen: checks this purchase against the
 * customer's own Money plan (in this browser). When it doesn't fit, approval
 * stays locked until the customer chooses to go over: the agent never can.
 */
export function SpendGuard({ item, purchases, override, onOverride, onBlockingChange }: { item: PurchaseToCheck; purchases: Purchase[]; override: boolean; onOverride: (v: boolean) => void; onBlockingChange: (blocking: boolean) => void }) {
  const { plan } = useMoneyPlan();
  const v = checkPurchase(plan, item, purchases);
  const blocking = needsOverride(v) && !override;
  useEffect(() => onBlockingChange(blocking), [blocking, onBlockingChange]);

  if (!plan) return null; // still loading the plan from this browser
  if (v.kind === "no-plan") {
    return (
      <div className="flex items-start gap-3 rounded-xl border bg-secondary/50 p-4 text-sm" data-testid="spend-guard" data-verdict="no-plan">
        <ShieldIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p>
          <b>Spend Guard</b> checks every purchase against your budget.{" "}
          <Link href="/money" className="font-medium text-brand-ink underline-offset-2 hover:underline">
            Set up your Money plan
          </Link>{" "}
          to turn it on.
        </p>
      </div>
    );
  }

  const fmt = (c: number) => formatAmount(c, v.currency);
  const price = v.estimated ? `${formatMoney(item.totalCents)} (about ${fmt(v.priceCents)})` : fmt(v.priceCents);
  const Icon = v.fits ? ShieldCheckIcon : ShieldAlertIcon;
  const tone = v.fits ? "border-success/40 bg-success-soft/50" : "border-warning/50 bg-warning-soft/60";

  return (
    <div className={`space-y-3 rounded-xl border p-4 text-sm ${tone}`} data-testid="spend-guard" data-verdict={v.fits ? "fits" : "over"} role="status">
      <p className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${v.fits ? "text-success-ink" : "text-warning-ink"}`} aria-hidden />
        <span>
          <b>Spend Guard: {v.fits ? "fits your plan" : "over your plan"}.</b>{" "}
          {v.kind === "rent" ? (
            v.fits ? (
              <>
                Rent of {fmt(v.rentCents)} a month is within the <b>{v.billName}</b> amount in your plan ({fmt(v.budgetCents)}).
              </>
            ) : (
              <>
                Rent of {fmt(v.rentCents)} a month is <b>{fmt(v.overCents)} more</b> than the {v.billName} amount in your plan ({fmt(v.budgetCents)}).
              </>
            )
          ) : v.kind === "goal" ? (
            v.fits ? (
              <>
                {price} is paid from your <b>{v.goalName}</b> fund ({fmt(v.savedCents)} saved).
              </>
            ) : (
              <>
                Your <b>{v.goalName}</b> fund has {fmt(v.savedCents)}; this costs {price}, {fmt(v.shortCents)} short.
              </>
            )
          ) : v.fits ? (
            <>
              {price} leaves <b>{fmt(v.afterCents)}</b> of your ENJOY budget this month, about {fmt(v.perDayAfterCents)} a day for the {v.daysLeft} days left.
            </>
          ) : (
            <>
              {price} is <b>{fmt(v.overCents)} more</b> than what’s left of your ENJOY budget this month ({fmt(v.leftCents)} of {fmt(v.limitCents)}).
            </>
          )}
        </span>
      </p>

      {!v.fits && (
        <ul className="ml-8 list-disc space-y-0.5 text-xs" data-testid="spend-guard-options">
          {v.kind === "rent" ? (
            <>
              <li>Ask your agent for a cheaper home, or one with fewer bedrooms.</li>
              <li>
                Or raise {v.billName}{" "}
                <Link href="/money" className="underline">
                  in your Money plan
                </Link>{" "}
                if this is the new rent.
              </li>
            </>
          ) : v.kind === "goal" ? (
            <li>Keep saving: the fund needs {fmt(v.shortCents)} more.</li>
          ) : (
            <>
              <li>Wait until {dateLabel(v.resetsOn)}, when your ENJOY budget starts again.</li>
              {v.fundOptions.slice(0, 2).map((f) => (
                <li key={f.goalId}>
                  Use your {f.name} fund ({fmt(f.savedCents)} saved){" "}
                  <Link href="/money" className="underline">
                    in your Money plan
                  </Link>
                  .
                </li>
              ))}
              <li>Ask your agent for a cheaper option.</li>
            </>
          )}
        </ul>
      )}

      {!v.fits && (
        <label className="ml-8 flex items-start gap-2 text-xs font-medium">
          <input type="checkbox" className="mt-0.5 size-4" checked={override} onChange={(e) => onOverride(e.target.checked)} data-testid="spend-guard-override" />
          I choose to go over my plan this time. (Your agent can’t do this for you.)
        </label>
      )}

      {v.dealCents !== undefined && v.kind !== "rent" && (
        <p className="ml-8 text-xs" data-testid="spend-guard-booking">
          This is only the refundable booking token. The full price of {fmt(v.dealCents)} is settled with the seller later
          {v.kind === "goal" ? `; your ${v.goalName} fund covers ${Math.min(100, Math.floor((v.savedCents / Math.max(1, v.dealCents)) * 100))}% of it so far.` : "."}
        </p>
      )}

      <p className="ml-8 text-[11px] text-muted-foreground">
        Checked against your Money plan in this browser{v.estimated ? `, using about ${v.rate} ${v.currency} per US$1 (an estimate)` : ""}. Nothing is shared.
      </p>
    </div>
  );
}
