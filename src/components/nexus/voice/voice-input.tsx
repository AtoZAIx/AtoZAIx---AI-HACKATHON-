"use client";

import { ArrowRightIcon, KeyboardIcon, MicIcon, MicOffIcon, RotateCcwIcon, SendIcon, ShieldCheckIcon, SquareIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { cn } from "cn";
import { AgentAvatar } from "@/components/nexus/agent-avatar";
import { ChatMessage } from "@/components/nexus/chat/chat-message";
import { Button } from "@/components/ui/button";
import { useNegotiation } from "@/hooks/use-negotiation";
import { useVoice } from "@/hooks/use-voice";
import { MERCHANT_DIRECTORY } from "@/lib/nexus/directory";
import { formatMoney } from "@/lib/nexus/money";
import type { CommerceSession, NexusOrder } from "@/lib/nexus/types";
import { VoiceStatus } from "./voice-status";
import { VoiceWaveform } from "./voice-waveform";

/**
 * Full-screen voice commerce. Voice and chat share one conversation; a
 * transcript is always shown for review before anything is sent, and voice
 * can never approve a purchase.
 */
export function VoiceInput({ initialSession, initialOrder }: { initialSession: CommerceSession | null; initialOrder: NexusOrder | null }) {
  const voice = useVoice();
  const nego = useNegotiation(initialSession, initialOrder);
  const session = nego.session;
  const lastReply = useMemo(() => [...(session?.chat ?? [])].reverse().find((m) => m.role === "buyer") ?? null, [session?.chat]);
  const busy = voice.state === "processing" || voice.state === "negotiating";

  const submit = useCallback(async () => {
    const text = voice.transcript.trim();
    if (!text) return;
    voice.setTranscript("");
    voice.setState("processing");
    const res = await nego.send(text, "voice");
    if (!res) {
      voice.setState("error");
      return;
    }
    const reply = [...res.session.chat].reverse().find((m) => m.role === "buyer");
    if (res.action.type === "negotiate") {
      if (reply) voice.speak(reply.text);
      voice.setState("negotiating");
      const done = await nego.negotiate();
      const rec = [...(done?.chat ?? [])].reverse().find((m) => m.role === "buyer");
      voice.setState("idle");
      if (rec) voice.speak(rec.text);
    } else {
      voice.setState("idle");
      if (reply) voice.speak(reply.text);
    }
  }, [nego, voice]);

  const unsupported = voice.supported && !voice.supported.recognition;
  const listening = voice.state === "listening" || voice.state === "transcribing";
  const best = session?.result?.ranking[0];
  const textHref = session ? `/negotiations/${session.id}` : "/";

  return (
    <div className="flex min-h-dvh flex-col bg-card" data-testid="voice-experience">
      <header className="flex h-16 items-center gap-3 border-b px-4 md:px-6">
        <Button asChild variant="ghost" size="icon" aria-label="Close voice mode">
          <Link href={textHref}>
            <XIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Voice commerce</p>
          <p className="truncate text-xs text-muted-foreground">{session?.intent?.summary ?? "Speak to your buyer agent"}</p>
        </div>
        <VoiceStatus state={voice.state} />
        <Button variant="ghost" size="icon" onClick={voice.toggleMute} aria-pressed={voice.muted} aria-label={voice.muted ? "Unmute spoken replies" : "Mute spoken replies"}>
          {voice.muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link href={textHref}>
            <KeyboardIcon /> Text chat
          </Link>
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
        {unsupported ? (
          <div className="surface space-y-3 p-6 text-center">
            <MicOffIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="font-semibold">Voice recognition isn’t available in this browser</p>
            <p className="text-sm text-muted-foreground">
              Speech-to-text uses the browser’s built-in SpeechRecognition, which this browser doesn’t provide. Chrome, Edge and Safari support it. Text chat works
              everywhere and uses the same conversation.
            </p>
            <Button asChild>
              <Link href={textHref}>
                <KeyboardIcon /> Switch to text chat
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 pt-2 text-center">
            <motion.button
              type="button"
              onClick={() => (listening ? voice.stop() : voice.start())}
              disabled={busy || voice.state === "transcribing" || voice.supported === null}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "relative flex size-28 items-center justify-center rounded-full text-white shadow-float transition-colors disabled:opacity-60",
                listening ? "bg-brand" : "bg-graphite",
              )}
              aria-label={listening ? "Stop listening" : voice.state === "speaking" ? "Interrupt and speak" : "Start speaking"}
              data-testid="voice-mic"
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:2s]" aria-hidden />}
              {listening ? <SquareIcon className="size-8" /> : <MicIcon className="size-10" />}
            </motion.button>
            <div className="flex h-16 w-full items-center justify-center">
              {listening && voice.analyser ? (
                <VoiceWaveform analyser={voice.analyser} />
              ) : listening ? (
                <p className="text-xs text-muted-foreground">Listening. Mic level display unavailable.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {voice.state === "speaking"
                    ? "Tap the mic to interrupt and speak"
                    : busy
                      ? "Your buyer agent is working on it"
                      : session?.result
                        ? "Try “go with Vantage”, “why Maison Aurum?” or “prefer a longer warranty”"
                        : "Tap and say what you want to buy, e.g. “a laptop under $900 with 16GB RAM”"}
                </p>
              )}
            </div>
            <AnimatePresence>
              {listening && voice.interim && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-lg text-lg text-muted-foreground" aria-live="polite">
                  {voice.interim}
                </motion.p>
              )}
            </AnimatePresence>
            {voice.error && (
              <p role="alert" className="rounded-xl bg-error-soft px-4 py-2 text-sm text-error-ink">
                {voice.error}
              </p>
            )}
          </div>
        )}

        {voice.transcript && !listening && !busy && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="surface space-y-3 p-4">
            <label htmlFor="voice-transcript" className="eyebrow">
              Review your request
            </label>
            <textarea
              id="voice-transcript"
              value={voice.transcript}
              onChange={(e) => voice.setTranscript(e.target.value)}
              className="field-sizing-content min-h-16 w-full resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus:border-brand/50"
              data-testid="voice-transcript"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submit()} data-testid="voice-send">
                <SendIcon /> Send to buyer agent
              </Button>
              <Button variant="outline" onClick={() => voice.start()}>
                <RotateCcwIcon /> Record again
              </Button>
              <Button variant="ghost" onClick={() => voice.setTranscript("")}>
                Discard
              </Button>
            </div>
          </motion.div>
        )}

        {voice.state === "negotiating" && session && (
          <div className="surface space-y-3 p-4" aria-live="polite">
            <p className="text-sm font-medium">{nego.phase?.label ?? "Negotiating"}</p>
            <ul className="space-y-2">
              {(["atelier", "bolt", "cove"] as const).map((id) => {
                const offers = session.offers.filter((o) => o.merchantId === id);
                const last = offers[offers.length - 1];
                return (
                  <li key={id} className="flex items-center gap-3 text-sm">
                    <AgentAvatar id={id} size="sm" />
                    <span className="flex-1">{MERCHANT_DIRECTORY[id].name}</span>
                    <span className="tabular font-medium">{last?.totalCents ? `${formatMoney(last.totalCents)} · v${last.version}` : last?.kind === "declined" ? "Declined" : "…"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {lastReply && voice.state !== "negotiating" && (
          <div className="surface space-y-3 p-4">
            <div className="flex items-center gap-2">
              <AgentAvatar id="buyer" size="sm" />
              <p className="flex-1 text-sm font-medium">Buyer agent</p>
              <Button variant="ghost" size="sm" onClick={voice.replay} disabled={!voice.supported?.synthesis}>
                <Volume2Icon /> Replay
              </Button>
              {voice.state === "speaking" && (
                <Button variant="ghost" size="sm" onClick={voice.stopSpeaking}>
                  <SquareIcon /> Stop
                </Button>
              )}
            </div>
            <p className="text-[15px] leading-relaxed">{lastReply.text}</p>
            <div className="flex flex-wrap gap-2">
              {best && session && !nego.order && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/negotiations/${session.id}`}>
                    Compare offers <ArrowRightIcon />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}

        {nego.order && nego.order.status === "awaiting_approval" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-4 sm:flex-row sm:items-center">
            <ShieldCheckIcon className="size-6 shrink-0 text-brand-ink" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Order ready for your approval</p>
              <p className="text-muted-foreground">Voice can prepare an order but never approves a purchase. Review the exact terms on screen.</p>
            </div>
            <Button asChild>
              <Link href={`/orders/${nego.order.id}`}>
                Review & approve <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        )}

        {session && session.chat.length > 0 && (
          <details className="group surface p-4">
            <summary className="cursor-pointer list-none text-sm font-medium">Conversation ({session.chat.length} messages)</summary>
            <div className="mt-4 max-h-80 space-y-4 overflow-y-auto">
              {session.chat.map((m) => (
                <ChatMessage key={m.id} m={m} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
