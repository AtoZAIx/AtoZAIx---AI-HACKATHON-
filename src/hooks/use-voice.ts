"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The eight voice states from the brief. */
export type VoiceState = "idle" | "listening" | "transcribing" | "processing" | "negotiating" | "speaking" | "interrupted" | "error";

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow it in your browser settings, or switch to text chat.",
  "service-not-allowed": "This browser blocked speech recognition. Switch to text chat.",
  "no-speech": "I didn't hear anything. Try again a little closer to the mic.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection in this browser.",
};

/**
 * Voice commerce engine: browser SpeechRecognition for input, a real
 * microphone AnalyserNode for the waveform, and SpeechSynthesis for replies.
 * Transcripts are returned for the user to review and edit — voice never
 * sends or approves anything by itself.
 */
export function useVoice() {
  const [supported, setSupported] = useState<{ recognition: boolean; synthesis: boolean } | null>(null);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [muted, setMuted] = useState(false);
  const [lastSpoken, setLastSpoken] = useState<string | null>(null);

  const rec = useRef<RecognitionLike | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const finalText = useRef("");
  const stateRef = useRef<VoiceState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Feature detection after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported({ recognition: Boolean(recognitionCtor()), synthesis: typeof window !== "undefined" && "speechSynthesis" in window });
  }, []);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    setAnalyser(null);
  }, []);

  const startMeter = useCallback(async () => {
    // A real level meter needs its own mic stream; if it fails we simply
    // show no waveform rather than a fake one.
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.75;
      ctx.createMediaStreamSource(s).connect(node);
      setAnalyser(node);
    } catch {
      setAnalyser(null);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setState("interrupted");
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Voice recognition isn't supported in this browser. Use text chat instead.");
      setState("error");
      return;
    }
    // Barge-in: talking over the agent interrupts its reply.
    if (stateRef.current === "speaking") stopSpeaking();
    setError(null);
    setInterim("");
    finalText.current = "";
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onspeechend = () => setState((s) => (s === "listening" ? "transcribing" : s));
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(ERRORS[e.error] ?? `Voice error: ${e.error}`);
      setState("error");
    };
    r.onend = () => {
      releaseMic();
      setInterim("");
      const text = finalText.current.trim();
      if (text) {
        setTranscript(text);
        setState("idle");
      } else if (stateRef.current !== "error") {
        setState(stateRef.current === "transcribing" || stateRef.current === "listening" ? "idle" : stateRef.current);
      }
    };
    rec.current = r;
    try {
      r.start();
      setTranscript("");
      setState("listening");
      void startMeter();
    } catch {
      setError("Couldn't start the microphone.");
      setState("error");
    }
  }, [releaseMic, startMeter, stopSpeaking]);

  /** Stop listening; final results arrive while we show "transcribing". */
  const stop = useCallback(() => {
    if (stateRef.current !== "listening") return;
    setState("transcribing");
    rec.current?.stop();
  }, []);

  /** Abandon the current capture. */
  const cancel = useCallback(() => {
    rec.current?.abort();
    releaseMic();
    setInterim("");
    setState("interrupted");
  }, [releaseMic]);

  const speak = useCallback(
    (text: string) => {
      setLastSpoken(text);
      if (muted || typeof window === "undefined" || !("speechSynthesis" in window)) {
        setState((s) => (s === "processing" || s === "negotiating" ? "idle" : s));
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\n+/g, ". "));
      u.rate = 1.03;
      u.onstart = () => setState("speaking");
      u.onend = () => setState((s) => (s === "speaking" ? "idle" : s));
      u.onerror = () => setState((s) => (s === "speaking" ? "idle" : s));
      window.speechSynthesis.speak(u);
    },
    [muted],
  );

  const replay = useCallback(() => {
    if (lastSpoken) {
      setMuted(false);
      const u = new SpeechSynthesisUtterance(lastSpoken.replace(/\n+/g, ". "));
      u.onstart = () => setState("speaking");
      u.onend = () => setState("idle");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }, [lastSpoken]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      return !m;
    });
    setState((s) => (s === "speaking" ? "idle" : s));
  }, []);

  useEffect(
    () => () => {
      rec.current?.abort();
      releaseMic();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [releaseMic],
  );

  return {
    supported,
    state,
    setState,
    transcript,
    setTranscript,
    interim,
    error,
    analyser,
    muted,
    lastSpoken,
    start,
    stop,
    cancel,
    speak,
    replay,
    stopSpeaking,
    toggleMute,
  };
}
