"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";

/**
 * Bars driven by a real microphone AnalyserNode. With no analyser (no mic
 * stream, unsupported, or not listening) it renders nothing — never a fake
 * animation pretending to be your voice.
 */
export function VoiceWaveform({ analyser, className, bars = 28 }: { analyser: AnalyserNode | null; className?: string; bars?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !analyser) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (reduce && t - last < 250) return;
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(data);
      const gap = 4;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      // Speech energy sits in the lower bins.
      const usable = Math.floor(data.length * 0.6);
      ctx.fillStyle = "#a8772a";
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * usable)] / 255;
        const bh = Math.max(3, v * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, bw / 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, bars]);

  if (!analyser) return null;
  return <canvas ref={canvas} className={cn("h-16 w-full max-w-sm", className)} aria-label="Live microphone level" role="img" />;
}
