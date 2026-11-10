import "server-only";
import { z } from "zod";
import { numbersConsistent } from "./agents/guardrails";
import { generateJson } from "./gemini";

/** What the browser sends: the computed analysis only, never the stored plan. */
export const CoachBody = z.object({
  score: z.number().int().min(0).max(100),
  band: z.enum(["strong", "fair", "needs-work"]),
  parts: z.array(z.object({ label: z.string().max(40), value: z.number().min(0).max(1), note: z.string().max(200) })).max(8),
  insights: z.array(z.object({ tone: z.enum(["good", "warn", "bad", "info"]), title: z.string().max(120), detail: z.string().max(400) })).max(12),
  amounts: z.array(z.number().int().min(0).max(1_000_000_000)).max(80),
});

export interface CoachReply {
  source: "gemini" | "rules";
  headline: string;
  tips: string[];
}

const BAND_LINE = {
  strong: "Your plan is in good shape.",
  fair: "Your plan works, with a few things to tighten.",
  "needs-work": "Your plan needs some changes to stay on track.",
} as const;

/** Deterministic coach used without Gemini, or when the AI's text fails the number check. */
export function rulesCoach(input: z.infer<typeof CoachBody>): CoachReply {
  const urgent = input.insights.filter((i) => i.tone === "bad" || i.tone === "warn");
  const pick = (urgent.length ? urgent : input.insights).slice(0, 3);
  const weakest = [...input.parts].sort((a, b) => a.value - b.value)[0];
  return {
    source: "rules",
    headline: `${BAND_LINE[input.band]} Health score ${input.score} of 100.`,
    tips: pick.length ? pick.map((i) => `${i.title}: ${i.detail}`) : weakest ? [`Focus on ${weakest.label.toLowerCase()}: ${weakest.note}`] : [],
  };
}

export async function coachMoney(input: z.infer<typeof CoachBody>): Promise<CoachReply> {
  const fallback = rulesCoach(input);
  const ai = await generateJson<{ headline: string; tips: string[] }>({
    label: "money-coach",
    system:
      "You are a friendly budgeting coach inside a shopping app. Use plain, short sentences. Only use dollar amounts that appear in the input, written exactly as given. Do not recommend investments, stocks, crypto or specific financial products. Do not promise outcomes. Give practical budgeting steps.",
    prompt: `Here is the shopper's money plan analysis as JSON. Write a one-sentence headline and at most 3 short, specific tips (each under 220 characters), most important first.\n${JSON.stringify({
      score: input.score,
      band: input.band,
      parts: input.parts,
      insights: input.insights,
    })}`,
    schema: {
      type: "object",
      properties: { headline: { type: "string" }, tips: { type: "array", items: { type: "string" }, maxItems: 3 } },
      required: ["headline", "tips"],
    },
    validate: (v) => z.object({ headline: z.string().min(1).max(240), tips: z.array(z.string().min(1).max(300)).max(3) }).parse(v),
    temperature: 0.3,
  });
  if (!ai) return fallback;
  const text = [ai.headline, ...ai.tips].join(" ");
  // Reject any narration that states an amount the analysis didn't produce.
  if (!numbersConsistent(text, input.amounts)) return fallback;
  return { source: "gemini", headline: ai.headline, tips: ai.tips };
}
