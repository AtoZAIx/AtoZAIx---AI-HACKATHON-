import type { CommerceSession, NegotiationEvent } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Anonymous, random per-browser ID used only as a fraud signal. Not tied to any person. */
export function deviceId(): string {
  try {
    let id = window.localStorage.getItem("nexus-device-id");
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem("nexus-device-id", id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const device = typeof window !== "undefined" ? deviceId() : "";
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(device ? { "x-nexus-device": device } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Apply a streamed protocol event to a local session copy (mirrors the server). */
export function applyEvent(s: CommerceSession, e: NegotiationEvent): CommerceSession {
  switch (e.type) {
    case "message":
      return { ...s, messages: [...s.messages, e.message] };
    case "offer":
      return { ...s, offers: [...s.offers, e.offer] };
    case "counter":
      return { ...s, counters: [...s.counters, e.counter] };
    case "result":
      return { ...s, result: e.result, status: "negotiated" };
    default:
      return s;
  }
}

/** Read an NDJSON response stream, calling `onEvent` per line. */
export async function readNdjson<T>(res: Response, onEvent: (e: T) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as T);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
}
