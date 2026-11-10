"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api, applyEvent, readNdjson } from "@/lib/nexus/client";
import type { CommerceSession, NegotiationEvent, NexusOrder } from "@/lib/nexus/types";

export interface PhaseState {
  phase: "discovery" | "negotiating" | "deciding" | "complete";
  round: number;
  label: string;
}

export type ChatAction = { type: "none" } | { type: "negotiate" } | { type: "order"; orderId: string };
type ChatResponse = { session: CommerceSession; action: ChatAction };

/**
 * One conversation, shared by chat, voice and the negotiation room. Every
 * event comes from the backend: chat replies, streamed protocol events and
 * the verified agreement.
 */
export function useNegotiation(initial: CommerceSession | null, initialOrder: NexusOrder | null = null) {
  const [session, setSession] = useState<CommerceSession | null>(initial);
  const [order, setOrder] = useState<NexusOrder | null>(initialOrder);
  const [phase, setPhase] = useState<PhaseState | null>(initial?.result ? { phase: "complete", round: initial.result.rounds, label: "Negotiation complete" } : null);
  const [streaming, setStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [locking, setLocking] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const idRef = useRef<string | null>(initial?.id ?? null);

  const refresh = useCallback(async () => {
    if (!idRef.current) return null;
    const data = await api<{ session: CommerceSession; order: NexusOrder | null }>(`/api/sessions/${idRef.current}`);
    setSession(data.session);
    setOrder(data.order);
    return data;
  }, []);

  /** Run the negotiation and apply each streamed event as it arrives. */
  const negotiate = useCallback(async (): Promise<CommerceSession | null> => {
    const id = idRef.current;
    if (!id) return null;
    setStreaming(true);
    setPhase({ phase: "discovery", round: 0, label: "Broadcasting request for quote" });
    setSession((s) => (s ? { ...s, status: "negotiating", messages: [], offers: [], counters: [], result: null, agreement: null } : s));
    try {
      const res = await fetch(`/api/sessions/${id}/negotiate`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Negotiation failed");
      await readNdjson<NegotiationEvent>(res, (e) => {
        setLastEventAt(new Date().toISOString());
        if (e.type === "phase") setPhase(e);
        else if (e.type === "error") toast.error(e.error);
        else setSession((s) => (s ? applyEvent(s, e) : s));
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Negotiation failed");
    } finally {
      setStreaming(false);
    }
    const data = await refresh().catch(() => null);
    return data?.session ?? null;
  }, [refresh]);

  /** Send a chat or voice message; starts a session if there isn't one yet. */
  const send = useCallback(
    async (text: string, via: "chat" | "voice", budgetCents?: number | null): Promise<ChatResponse | null> => {
      setSending(true);
      const optimistic = { id: `tmp_${Date.now()}`, role: "user" as const, text, via, createdAt: new Date().toISOString() };
      setSession((s) => (s ? { ...s, chat: [...s.chat, optimistic] } : s));
      try {
        const res = idRef.current
          ? await api<ChatResponse>(`/api/sessions/${idRef.current}/chat`, { json: { text, via } })
          : await api<ChatResponse>("/api/sessions", { json: { text, via, budgetCents: budgetCents ?? null } });
        idRef.current = res.session.id;
        setSession(res.session);
        if (res.action.type === "order") await refresh();
        return res;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Message failed");
        await refresh().catch(() => null);
        return null;
      } finally {
        setSending(false);
      }
    },
    [refresh],
  );

  const lock = useCallback(
    async (offerId: string) => {
      if (!idRef.current) return null;
      setLocking(offerId);
      try {
        const data = await api<{ session: CommerceSession; order: NexusOrder }>(`/api/sessions/${idRef.current}/lock`, { json: { offerId } });
        setSession(data.session);
        setOrder(data.order);
        toast.success(`Agreement v${data.session.agreement?.version ?? 1} verified`);
        return data;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not lock deal");
        await refresh().catch(() => null);
        return null;
      } finally {
        setLocking(null);
      }
    },
    [refresh],
  );

  return { session, order, phase, streaming, sending, locking, lastEventAt, refresh, negotiate, send, lock };
}
