import "server-only";
import { containsSecret, echoesInstructions, logSecretBlock } from "./security/secrets";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";

let client: GoogleGenAI | null = null;

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && process.env.NEXUS_DISABLE_LLM !== "1";
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export interface JsonCall<T> {
  system: string;
  prompt: string;
  /** Optional inline media (e.g. an uploaded product photo). */
  media?: { mimeType: string; base64: string };
  /** JSON Schema for the structured response. */
  schema: Record<string, unknown>;
  /** Validate and narrow the parsed JSON; throw to reject. */
  validate: (value: unknown) => T;
  temperature?: number;
  timeoutMs?: number;
  label: string;
}

/**
 * Structured Gemini call. Returns null (never throws) when Gemini is not
 * configured, times out, or returns something that fails validation, so
 * every caller has a deterministic fallback.
 */
export async function generateJson<T>(call: JsonCall<T>): Promise<T | null> {
  // Credentials and secrets never go to a model, whether or not one is configured.
  if (containsSecret(call.system) || containsSecret(call.prompt)) {
    logSecretBlock(call.label, "input", "request contained a configured secret; call refused");
    return null;
  }
  if (!geminiEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS ?? 12000));
  const thinkingLevel = process.env.GEMINI_THINKING_LEVEL as ThinkingLevel | undefined;
  try {
    const res = await getClient().models.generateContent({
      model: geminiModel(),
      contents: call.media
        ? [{ role: "user", parts: [{ inlineData: { mimeType: call.media.mimeType, data: call.media.base64 } }, { text: call.prompt }] }]
        : call.prompt,
      config: {
        systemInstruction: call.system,
        responseMimeType: "application/json",
        responseJsonSchema: call.schema,
        temperature: call.temperature ?? 0.4,
        abortSignal: controller.signal,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    });
    const text = res.text;
    if (!text) return null;
    const value = call.validate(JSON.parse(text));
    const serialized = JSON.stringify(value);
    if (containsSecret(serialized) || echoesInstructions(serialized, call.system)) {
      logSecretBlock(call.label, "output", "model output repeated its instructions or a secret; discarded");
      return null;
    }
    return value;
  } catch (err) {
    console.warn(`[gemini:${call.label}]`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
