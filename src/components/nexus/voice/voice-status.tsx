import { AlertCircleIcon, AudioLinesIcon, HandshakeIcon, Loader2Icon, MicIcon, PauseCircleIcon, Volume2Icon, WavesIcon } from "lucide-react";
import { cn } from "cn";
import type { VoiceState } from "@/hooks/use-voice";

const META: Record<VoiceState, { label: string; icon: typeof MicIcon; cls: string }> = {
  idle: { label: "Ready", icon: MicIcon, cls: "bg-secondary text-muted-foreground" },
  listening: { label: "Listening", icon: WavesIcon, cls: "bg-brand-soft text-brand-ink" },
  transcribing: { label: "Transcribing", icon: AudioLinesIcon, cls: "bg-brand-soft text-brand-ink" },
  processing: { label: "Processing", icon: Loader2Icon, cls: "bg-secondary text-foreground" },
  negotiating: { label: "Agents negotiating", icon: HandshakeIcon, cls: "bg-brand-soft text-brand-ink" },
  speaking: { label: "Speaking", icon: Volume2Icon, cls: "bg-secondary text-foreground" },
  interrupted: { label: "Interrupted", icon: PauseCircleIcon, cls: "bg-warning-soft text-warning-ink" },
  error: { label: "Error", icon: AlertCircleIcon, cls: "bg-error-soft text-error-ink" },
};

export function VoiceStatus({ state, className }: { state: VoiceState; className?: string }) {
  const m = META[state];
  const Icon = m.icon;
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium", m.cls, className)} data-voice-state={state}>
      <Icon className={cn("size-3.5", (state === "processing" || state === "transcribing") && "animate-spin [animation-duration:1.4s]")} aria-hidden />
      {m.label}
    </span>
  );
}
