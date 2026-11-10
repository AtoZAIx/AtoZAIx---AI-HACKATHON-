import "server-only";
import { appendRecord } from "./ledger";

/** Secrets that must never appear in anything sent to, or returned by, an AI model. */
function secretValues(): string[] {
  return ["PAYPAL_CLIENT_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_WEBHOOK_ID", "GEMINI_API_KEY", "NEXUS_SIGNING_SECRET", "NEXUS_SIM_WEBHOOK_SECRET", "NEXUS_MERCHANT_PASSCODE_ATELIER", "NEXUS_MERCHANT_PASSCODE_BOLT", "NEXUS_MERCHANT_PASSCODE_COVE"]
    .map((k) => process.env[k])
    .filter((v): v is string => typeof v === "string" && v.length >= 8);
}

export function containsSecret(text: string): boolean {
  return secretValues().some((s) => text.includes(s));
}

/** True when the model's output repeats 8+ consecutive words of its own instructions. */
export function echoesInstructions(output: string, system: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const sys = words(system);
  if (sys.length < 8) return false;
  const out = ` ${words(output).join(" ")} `;
  for (let i = 0; i + 8 <= sys.length; i++) if (out.includes(` ${sys.slice(i, i + 8).join(" ")} `)) return true;
  return false;
}

export function logSecretBlock(label: string, direction: "input" | "output", what: string) {
  appendRecord("security-event", {
    id: `sec_${crypto.randomUUID().slice(0, 12)}`,
    at: new Date().toISOString(),
    kind: "secret-leak-blocked",
    severity: "high",
    title: direction === "input" ? "Stopped a secret from reaching the AI" : "Blocked AI output that leaked internals",
    detail: `${label}: ${what}`,
    ref: null,
  });
}
