import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/nexus/common/loading-state";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";
import { StatusBadge } from "@/components/nexus/common/status-badge";
import { PreferencesPanel } from "@/components/nexus/settings/preferences";
import { geminiEnabled, geminiModel } from "@/lib/nexus/gemini";
import { devPasscodeActive } from "@/lib/nexus/merchant-auth";
import { paymentConfig } from "@/lib/nexus/service";
import { supabaseStatus, type SupabaseStatus } from "@/lib/nexus/supabase-sync";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Page>
      <PageHeader title="Settings" description="Your preferences and the live status of every integration." />
      <Suspense fallback={<LoadingState variant="panel" />}>
        <Body />
      </Suspense>
    </Page>
  );
}

async function Body() {
  await connection();
  const p = paymentConfig();
  const rows: Array<{ name: string; status: React.ReactNode; detail: string }> = [
    {
      name: "AI agents",
      status: geminiEnabled() ? <StatusBadge tone="success" label="Gemini connected" /> : <StatusBadge tone="neutral" label="Policy engine only" />,
      detail: geminiEnabled() ? `Model ${geminiModel()}; every move is clamped by merchant policy.` : "Set GEMINI_API_KEY for Gemini intent parsing, strategy and narration.",
    },
    {
      name: "Payments",
      status: p.provider === "paypal-sandbox" ? <StatusBadge tone="success" label="PayPal Sandbox" /> : <StatusBadge tone="warning" label="Simulator" />,
      detail: p.provider === "paypal-sandbox" ? "Orders API v2 with server-side capture and verification." : "No PayPal credentials set; the simulator follows the same lifecycle without moving money.",
    },
    {
      name: "Webhook verification",
      status: p.webhookRequired ? <StatusBadge tone="success" label="Required" /> : <StatusBadge tone="neutral" label="Optional" />,
      detail: p.webhookRequired ? "Orders confirm only after a signed PAYMENT.CAPTURE.COMPLETED event." : "Set NEXUS_REQUIRE_WEBHOOK=true and PAYPAL_WEBHOOK_ID to require it in sandbox.",
    },
    storageRow(await supabaseStatus()),
    {
      name: "Live updates",
      status: <StatusBadge tone="success" label="Streaming" />,
      detail: "Negotiation events stream from the backend as NDJSON. Supabase Realtime is not connected.",
    },
    {
      name: "Merchant access",
      status: devPasscodeActive() ? <StatusBadge tone="warning" label="Dev passcode active" /> : <StatusBadge tone="success" label="Passcodes configured" />,
      detail: "Merchant workspaces require a signed, httpOnly role cookie checked on every request.",
    },
  ];
  return (
    <div className="space-y-8">
      <Section title="Preferences" description="Stored in this browser only">
        <PreferencesPanel allowReset={process.env.NODE_ENV !== "production" || process.env.NEXUS_ALLOW_RESET === "1"} />
      </Section>
      <Section title="Integrations">
        <ul className="surface divide-y">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-4">
              <p className="w-44 shrink-0 text-sm font-medium">{r.name}</p>
              <p className="flex-1 text-xs text-muted-foreground">{r.detail}</p>
              {r.status}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** Data storage: live Supabase status (checked on each visit; never shows keys). */
function storageRow(st: SupabaseStatus): { name: string; status: React.ReactNode; detail: string } {
  const name = "Data storage";
  if (!st.configured) {
    return {
      name,
      status: <StatusBadge tone="warning" label="Server memory" />,
      detail: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? "Supabase project linked. To save data there, add SUPABASE_SECRET_KEY to .env.local and run the SQL in supabase/migrations in the Supabase SQL editor. Until then, deals and orders reset when the server restarts."
        : "Supabase is not connected. Deals and orders reset when the server restarts; the schema is in supabase/migrations.",
    };
  }
  const missing = Object.entries(st.tables)
    .filter(([, ok]) => !ok)
    .map(([t]) => t);
  if (!st.reachable) return { name, status: <StatusBadge tone="error" label="Supabase unreachable" />, detail: "The app carries on from server memory and retries on each change." };
  if (missing.length)
    return {
      name,
      status: <StatusBadge tone="warning" label="Supabase: tables missing" />,
      detail: `Missing: ${missing.join(", ")}. Run supabase/migrations/0001_nexus.sql and 0002_security_ledger.sql in the Supabase SQL editor. Meanwhile data stays in server memory.`,
    };
  return {
    name,
    status: <StatusBadge tone="success" label="Supabase" />,
    detail: "Deals, orders, PayPal webhook ids and the security ledger are saved to your Supabase project and read back after a restart. The Money plan stays in your browser.",
  };
}
