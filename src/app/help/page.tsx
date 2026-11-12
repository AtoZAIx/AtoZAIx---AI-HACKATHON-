import { BadgeCheckIcon, HandshakeIcon, MessagesSquareIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { Page, PageHeader, Section } from "@/components/nexus/common/page-header";

export const metadata: Metadata = { title: "Help & Support" };

const STEPS = [
  { icon: MessagesSquareIcon, title: "Describe it", body: "Type, speak, or pick a product. Set a spending limit if you have one; merchants never see it." },
  { icon: HandshakeIcon, title: "Agents negotiate", body: "Your buyer agent runs up to three rounds with three simulated merchants and ranks the final offers." },
  { icon: BadgeCheckIcon, title: "Deal is verified", body: "Selecting a deal runs deterministic checks. Anything essential that fails or is unknown blocks the order." },
  { icon: ShieldCheckIcon, title: "You approve", body: "You approve the exact amount and agreement version. Any change requires a fresh approval." },
  { icon: WalletIcon, title: "PayPal pays", body: "You authenticate with PayPal. AtoZAIx confirms the order only after verifying the capture server-side." },
];

const FAQ = [
  ["Are the merchants real?", "Not yet. Maison Aurum, Vantage Market and Cove Commerce are simulated merchants with their own catalogues, stock and confidential pricing rules. They are labelled as simulated throughout."],
  ["Can voice buy something on its own?", "No. Voice can describe what you want and select a deal, which prepares an order. Approval always needs an explicit on-screen confirmation."],
  ["What does UNKNOWN mean in verification?", "The engine couldn't confirm that fact. If the check is essential, the deal is blocked exactly as if it had failed. Advisory checks are shown but don't block."],
  ["Why might my approval be invalidated?", "Approvals are bound to an agreement version and terms hash. Re-negotiating or any material change creates a new version that needs your approval."],
  ["When is a payment considered successful?", "Only when the backend has captured it and re-read it from PayPal: status, amount, currency, payee and order reference must all match, and the webhook signature must verify when required."],
  ["How are merchant costs kept private?", "Costs, margins, floors and budgets live in server-only code and are returned only to a signed-in merchant. Customer pages and buyer-agent messages never include them."],
  ["Is my data stored?", "In this version everything is held in server memory and is cleared when the server restarts."],
];

export default function HelpPage() {
  return (
    <Page>
      <PageHeader title="Help & Support" description="How AtoZAIx works, and answers to common questions." />
      <Section title="How it works">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="surface space-y-2 p-4">
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-brand-ink" />
                <span className="eyebrow">Step {i + 1}</span>
              </span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Frequently asked questions">
        <div className="surface divide-y">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {q}
                <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </Section>
      <Section title="Support">
        <p className="surface p-5 text-sm text-muted-foreground">This is a hackathon MVP without a staffed support channel. For setup and integration details, see the README in the project repository.</p>
      </Section>
    </Page>
  );
}
