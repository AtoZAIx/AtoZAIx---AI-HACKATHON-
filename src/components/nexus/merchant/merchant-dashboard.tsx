"use client";

import { Loader2Icon, LockIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { EmptyState } from "@/components/nexus/common/empty-state";
import { SimulatedBadge } from "@/components/nexus/common/simulated-badge";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/nexus/client";
import type { MerchantWorkspace, WorkspacePolicy } from "@/lib/nexus/merchant-workspace";
import { agentDiscountCap } from "@/lib/nexus/agents/pricing";
import { formatMoney } from "@/lib/nexus/money";
import { INCENTIVE_LEVERS } from "@/lib/nexus/types";
import { HistoryIcon } from "lucide-react";
import { IncentiveAllocator } from "./incentive-allocator";
import { MoneyInput, PercentInput } from "./money-input";
import { MutualDealZone } from "./mutual-deal-zone";
import { OfferBudgetManager } from "./offer-budget-manager";
import { listingErrors, PricingConfiguration, type EditableListing } from "./pricing-configuration";
import { ProfitProtectionPanel } from "./profit-protection-panel";
import { LocalTime } from "@/components/nexus/common/local-time";

function editable(ws: MerchantWorkspace): Record<string, EditableListing> {
  return Object.fromEntries(ws.listings.map((l) => [l.id, { id: l.id, costCents: l.costCents, listPriceCents: l.listPriceCents, maxSellingPriceCents: l.maxSellingPriceCents, floorPriceCents: l.floorPriceCents, stock: l.stock }]));
}

/** Role-restricted merchant workspace. Data arrives only after server-side authorisation. */
export function MerchantDashboard({ initial }: { initial: MerchantWorkspace }) {
  const router = useRouter();
  const [ws, setWs] = useState(initial);
  const [policy, setPolicy] = useState<WorkspacePolicy>(initial.policy);
  const [edits, setEdits] = useState(() => editable(initial));
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(policy) !== JSON.stringify(ws.policy) || JSON.stringify(edits) !== JSON.stringify(editable(ws)), [policy, edits, ws]);
  const openingTooHigh = policy.openingDiscountPct > agentDiscountCap(policy) + 0.00001;
  const invalid =
    Object.values(edits).some((l) => listingErrors(l).length > 0) || INCENTIVE_LEVERS.reduce((s, l) => s + policy.incentiveAllocation[l], 0) > 1.0001 || openingTooHigh;
  const remainingCampaign = INCENTIVE_LEVERS.reduce((s, l) => s + Math.max(0, ws.remaining.incentiveCents[l]), 0);
  const won = ws.history.filter((h) => h.outcome === "won");
  const avgProfit = won.length ? won.reduce((s, h) => s + (h.marginCents ?? 0), 0) / won.length : null;

  async function save() {
    setSaving(true);
    try {
      const next = await api<MerchantWorkspace>("/api/merchant/config", { method: "PUT", json: { policy, listings: Object.values(edits) } });
      setWs(next);
      setPolicy(next.policy);
      setEdits(editable(next));
      toast.success("Commercial configuration saved. New negotiations use it immediately.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch("/api/merchant/session", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AgentAvatar id={ws.merchant.id} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Merchant workspace · Mutual intelligence</p>
          <h1 className="text-2xl font-semibold tracking-tight">{ws.merchant.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral" label={`${ws.merchant.archetype} merchant`} />
            <SimulatedBadge />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={policy.active} onCheckedChange={(v) => setPolicy({ ...policy, active: v })} aria-label="Accept new negotiations" />
          {policy.active ? "Accepting negotiations" : "Paused"}
        </label>
        <Button variant="outline" onClick={signOut}>
          <LogOutIcon /> Sign out
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-graphite/10 bg-graphite px-4 py-3 text-sm text-white">
        <LockIcon className="mt-0.5 size-4 shrink-0" />
        <p>Confidential: costs, margins, floors and budgets on this page are visible only to {ws.merchant.name}. Shoppers and buyer agents never receive them; the engine enforces them server-side.</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Concession budget left" value={formatMoney(Math.max(0, ws.remaining.concessionCents))} sub={`of ${formatMoney(ws.policy.concessionBudgetCents)}`} />
        <Kpi label="Campaign budget left" value={formatMoney(remainingCampaign)} sub={`of ${formatMoney(ws.policy.campaignBudgetCents)}`} />
        <Kpi label="Deals won" value={String(won.length)} sub={`${ws.history.length} negotiations`} />
        <Kpi label="Avg gross profit / won deal" value={avgProfit === null ? "—" : formatMoney(Math.round(avgProfit))} sub="after incentives" />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <PricingConfiguration listings={ws.listings} edits={edits} onEdit={(id, patch) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))} />
          <section className="surface overflow-hidden" aria-labelledby="history-title">
            <div className="border-b px-4 py-3">
              <h2 id="history-title" className="text-sm font-semibold">
                Negotiation history
              </h2>
            </div>
            {ws.history.length === 0 ? (
              <div className="p-4">
                <EmptyState compact icon={HistoryIcon} title="No negotiations yet" description="Your agent's offers appear here after shoppers run negotiations." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-medium">When</th>
                      <th className="px-2 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 text-right font-medium">Opening</th>
                      <th className="px-2 py-2 text-right font-medium">Final</th>
                      <th className="px-2 py-2 text-right font-medium">Gross profit</th>
                      <th className="px-4 py-2 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ws.history.map((h) => (
                      <tr key={h.sessionId}>
                        <td className="tabular px-4 py-2.5 text-xs text-muted-foreground"><LocalTime iso={h.at} mode="datetime" /></td>
                        <td className="px-2">{h.productName}</td>
                        <td className="tabular px-2 text-right">{h.openingCents ? formatMoney(h.openingCents) : "—"}</td>
                        <td className="tabular px-2 text-right font-medium">{h.finalCents ? formatMoney(h.finalCents) : "—"}</td>
                        <td className={`tabular px-2 text-right ${h.marginCents !== null && h.marginCents < 0 ? "text-error-ink" : ""}`}>{h.marginCents === null ? "—" : formatMoney(h.marginCents)}</td>
                        <td className="px-4">
                          <StatusBadge
                            tone={h.outcome === "won" ? "success" : h.outcome === "recommended" ? "brand" : h.outcome === "declined" ? "neutral" : "info"}
                            label={h.outcome === "won" ? "Won" : h.outcome === "recommended" ? "Recommended" : h.outcome === "declined" ? "Declined" : "Not chosen"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          <section className="surface space-y-3 p-4" aria-labelledby="guardrails-title">
            <h2 id="guardrails-title" className="text-sm font-semibold">
              Commercial guardrails
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Maximum discount">
                <PercentInput label="Maximum discount" value={policy.maxDiscountPct} max={50} onChange={(v) => setPolicy({ ...policy, maxDiscountPct: v })} />
              </Field>
              <Field label="Agent limit (share of maximum)">
                <PercentInput label="Agent limit, share of the maximum discount" value={policy.agentLimitPct} max={100} onChange={(v) => setPolicy({ ...policy, agentLimitPct: Math.max(0.5, v) })} />
              </Field>
              <Field label="Opening discount">
                <PercentInput label="Opening discount" value={policy.openingDiscountPct} max={50} onChange={(v) => setPolicy({ ...policy, openingDiscountPct: v })} />
              </Field>
              <Field label="Minimum profit / unit">
                <MoneyInput label="Minimum profit per unit" cents={policy.minProfitCents} onChange={(c) => setPolicy({ ...policy, minProfitCents: c })} />
              </Field>
              <Field label="Minimum profit margin">
                <PercentInput label="Minimum profit margin" value={policy.minMarginPct} onChange={(v) => setPolicy({ ...policy, minMarginPct: v })} />
              </Field>
              <Field label="Offer validity (min)">
                <input
                  aria-label="Offer validity in minutes"
                  inputMode="numeric"
                  value={policy.offerValidityMinutes}
                  onChange={(e) => setPolicy({ ...policy, offerValidityMinutes: Math.max(5, Math.min(240, Number(e.target.value.replace(/\D/g, "")) || 5)) })}
                  className="tabular h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:border-brand/50"
                />
              </Field>
            </div>
            {openingTooHigh && (
              <p className="text-xs text-error-ink" role="alert">
                The opening discount can’t be more than the agent limit allows ({Math.round(agentDiscountCap(policy) * 1000) / 10}%).
              </p>
            )}
            <MutualDealZone maxPct={policy.maxDiscountPct} agentLimitPct={policy.agentLimitPct} openingPct={policy.openingDiscountPct} />
            {ws.clearance.map((c) => (
              <MutualDealZone
                key={c.listingId}
                title={`Clearance: ${c.productName}`}
                note="This item has its own maximum and opening discount. Your agent limit still applies."
                maxPct={c.maxDiscountPct}
                agentLimitPct={policy.agentLimitPct}
                openingPct={c.openingDiscountPct}
              />
            ))}
          </section>
          <OfferBudgetManager
            concessionBudget={policy.concessionBudgetCents}
            campaignBudget={policy.campaignBudgetCents}
            remainingConcession={ws.remaining.concessionCents}
            remainingCampaign={remainingCampaign}
            onChange={(p) => setPolicy({ ...policy, ...p })}
            ledger={ws.ledger}
          />
          <IncentiveAllocator allocation={policy.incentiveAllocation} campaignBudget={policy.campaignBudgetCents} remaining={ws.remaining.incentiveCents} onChange={(a) => setPolicy({ ...policy, incentiveAllocation: a })} />
          <ProfitProtectionPanel listings={ws.listings} active={policy.active} />
        </div>
      </div>

      {dirty && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 lg:left-auto lg:w-[calc(100%-252px)]">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <p className="flex-1 text-sm">{invalid ? <span className="text-error-ink">Fix the highlighted values before saving.</span> : "You have unsaved changes."}</p>
            <Button
              variant="ghost"
              onClick={() => {
                setPolicy(ws.policy);
                setEdits(editable(ws));
              }}
            >
              Discard
            </Button>
            <Button onClick={save} disabled={saving || invalid} data-testid="merchant-save">
              {saving && <Loader2Icon className="animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold">{value}</dd>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
