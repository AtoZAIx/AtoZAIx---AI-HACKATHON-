import { ShieldCheckIcon } from "lucide-react";
import type { WorkspaceListing } from "@/lib/nexus/merchant-workspace";

export function ProfitProtectionPanel({ listings, active }: { listings: WorkspaceListing[]; active: boolean }) {
  const counts = { protected: 0, raised: 0, blocked: 0 };
  for (const l of listings) counts[l.protection]++;
  return (
    <section className="surface space-y-3 p-4" aria-labelledby="protect-title">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="size-4 text-success" />
        <h2 id="protect-title" className="text-sm font-semibold">
          Profit protection
        </h2>
        <span className={`ml-auto text-xs font-medium ${active ? "text-success-ink" : "text-warning-ink"}`}>{active ? "Enforced on every offer" : "Paused: declining all RFQs"}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-success-soft p-2">
          <dd className="tabular text-lg font-semibold text-success-ink">{counts.protected}</dd>
          <dt className="text-[11px] text-muted-foreground">Protected</dt>
        </div>
        <div className="rounded-lg bg-warning-soft p-2">
          <dd className="tabular text-lg font-semibold text-warning-ink">{counts.raised}</dd>
          <dt className="text-[11px] text-muted-foreground">Guardrail raised</dt>
        </div>
        <div className="rounded-lg bg-error-soft p-2">
          <dd className="tabular text-lg font-semibold text-error-ink">{counts.blocked}</dd>
          <dt className="text-[11px] text-muted-foreground">Withheld</dt>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Agents can never offer below the effective minimum. Gemini-proposed moves are clamped to it, and the deal verification engine re-checks it before any order is created.
      </p>
    </section>
  );
}
