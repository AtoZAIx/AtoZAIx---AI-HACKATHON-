"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface NexusConfig {
  payments: { provider: "paypal-sandbox" | "simulated"; webhookRequired: boolean };
  ai: { gemini: boolean; model: string | null };
}

/** Live backend health: pings /api/config and reports the real modes. */
export function useNexusConfig() {
  const [state, setState] = useState<{ status: "checking" | "online" | "offline"; config: NexusConfig | null }>({ status: "checking", config: null });
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const config = (await res.json()) as NexusConfig;
        if (alive) setState({ status: "online", config });
      } catch {
        if (alive) setState((s) => ({ status: "offline", config: s.config }));
      }
    };
    void ping();
    const t = setInterval(ping, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return state;
}

export function ConnectionStatus({ compact }: { compact?: boolean }) {
  const { status, config } = useNexusConfig();
  const label = status === "checking" ? "Connecting" : status === "offline" ? "Offline" : config?.payments.provider === "paypal-sandbox" ? "PayPal Sandbox" : "Demo mode";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-8 items-center gap-2 rounded-full border bg-card px-3 text-xs font-medium" tabIndex={0}>
          <span className={cn("size-2 rounded-full", status === "online" ? "bg-success" : status === "offline" ? "bg-error" : "bg-warning animate-pulse")} aria-hidden />
          <span className="sr-only">Connection: </span>
          <span className={compact ? "sr-only" : undefined}>{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 space-y-0.5">
        <p>Backend: {status}</p>
        {config && (
          <>
            <p>Payments: {config.payments.provider === "paypal-sandbox" ? "PayPal Sandbox (Orders v2)" : "Simulator, no money moves"}</p>
            <p>Agents: {config.ai.gemini ? `Gemini (${config.ai.model}) + policy` : "Policy engine (no Gemini key)"}</p>
            <p>Live updates: streamed from the negotiation API</p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
