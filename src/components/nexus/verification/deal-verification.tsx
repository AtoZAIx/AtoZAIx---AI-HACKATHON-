import { CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, CircleXIcon } from "lucide-react";
import { cn } from "cn";
import { CHECK_STATUS, StatusBadge } from "@/components/nexus/common/status-badge";
import { friendlyCheck } from "@/lib/nexus/friendly";
import type { VerificationCheck, VerificationReport } from "@/lib/nexus/types";
import { LocalTime } from "@/components/nexus/common/local-time";

const ICON = {
  pass: { icon: CircleCheckIcon, cls: "text-success" },
  fail: { icon: CircleXIcon, cls: "text-error" },
  unknown: { icon: CircleHelpIcon, cls: "text-warning" },
};

export function summarize(report: VerificationReport) {
  const passed = report.checks.filter((c) => c.status === "pass").length;
  const failed = report.checks.filter((c) => c.status === "fail").length;
  const unknown = report.checks.filter((c) => c.status === "unknown").length;
  const blocking = report.checks.filter((c) => c.essential && c.status !== "pass");
  return { passed, failed, unknown, blocking };
}

/** Overall verdict. An essential UNKNOWN is never shown as verified. */
export function VerificationVerdict({ report, className }: { report: VerificationReport; className?: string }) {
  const s = summarize(report);
  const ok = report.ok;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-4", ok ? "border-success/30 bg-success-soft/50" : s.blocking.some((c) => c.status === "fail") ? "border-error/30 bg-error-soft/50" : "border-warning/30 bg-warning-soft/50", className)}>
      {ok ? <CircleCheckIcon className="size-7 text-success" /> : s.blocking.some((c) => c.status === "fail") ? <CircleXIcon className="size-7 text-error" /> : <CircleAlertIcon className="size-7 text-warning" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{ok ? "All safety checks passed" : s.blocking.some((c) => c.status === "fail") ? "Stopped: an important check failed" : "Stopped: we couldn’t confirm something important"}</p>
        <p className="text-xs text-muted-foreground">
          Checked <LocalTime iso={report.checkedAt} mode="datetime" /> by fixed AtoZAIx rules, not by AI guesswork
        </p>
      </div>
      <dl className="flex gap-4 text-center text-xs">
        <Count label="Passed" value={s.passed} cls="text-success-ink" />
        <Count label="Failed" value={s.failed} cls="text-error-ink" />
        <Count label="Unknown" value={s.unknown} cls="text-warning-ink" />
      </dl>
    </div>
  );
}

function Count({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div>
      <dd className={cn("tabular text-lg font-semibold", cls)}>{value}</dd>
      <dt className="text-muted-foreground">{label}</dt>
    </div>
  );
}

/** Grouped checks with evidence and timestamps. */
export function DealVerification({ report }: { report: VerificationReport }) {
  const groups = new Map<string, VerificationCheck[]>();
  for (const c of report.checks) groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
  return (
    <div className="space-y-4">
      <VerificationVerdict report={report} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...groups.entries()].map(([category, checks]) => {
          const worst = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "unknown") ? "unknown" : "pass";
          return (
            <section key={category} className="surface overflow-hidden" aria-label={category}>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">{category}</h3>
                <StatusBadge tone={CHECK_STATUS[worst].tone} label={CHECK_STATUS[worst].label.toUpperCase()} />
              </div>
              <ul className="divide-y">
                {checks.map((c) => {
                  const { icon: Icon, cls } = ICON[c.status];
                  return (
                    <li key={c.id} className="px-4 py-3" data-check={c.id} data-status={c.status}>
                      <div className="flex items-start gap-3">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", cls)} aria-hidden />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{friendlyCheck(c)}</p>
                            <span className={cn("text-[10px] font-semibold tracking-wide", c.status === "pass" ? "text-success-ink" : c.status === "fail" ? "text-error-ink" : "text-warning-ink")}>
                              {CHECK_STATUS[c.status].label.toUpperCase()}
                            </span>
                            {c.essential ? <span className="rounded bg-secondary px-1.5 text-[10px] text-muted-foreground">Important</span> : <span className="rounded border px-1.5 text-[10px] text-muted-foreground">For your info</span>}
                          </div>
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Technical details</summary>
                            <ul className="mt-1.5 space-y-0.5 rounded-lg bg-secondary p-2 font-mono text-[11px] break-words">
                              <li>{c.label}</li>
                              <li>{c.detail}</li>
                              {c.evidence.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          </details>
                        </div>
                        <time className="tabular shrink-0 text-[11px] text-muted-foreground" dateTime={c.checkedAt}>
                          <LocalTime iso={c.checkedAt} mode="time-s" />
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
