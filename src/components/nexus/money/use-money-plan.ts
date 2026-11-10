"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_PLAN, parsePlan, type MoneyPlan } from "@/lib/nexus/budget";

/**
 * The money plan lives in this browser only (localStorage), never on the
 * server. Falls back to memory when storage is blocked (private windows).
 */
const KEY = "nexus-money-plan-v1";
const listeners = new Set<() => void>();
let memoryRaw: string | null = null;
let cache: { raw: string | null; plan: MoneyPlan } | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return memoryRaw;
  }
}

function writeRaw(raw: string | null) {
  try {
    if (raw === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, raw);
  } catch {
    memoryRaw = raw;
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): MoneyPlan | null {
  const raw = readRaw();
  if (!cache || cache.raw !== raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    cache = { raw, plan: parsed ? parsePlan(parsed) : EMPTY_PLAN };
  }
  return cache.plan;
}

/** `null` while rendering on the server and during hydration. */
export function useMoneyPlan() {
  const plan = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const update = useCallback((fn: (p: MoneyPlan) => MoneyPlan) => writeRaw(JSON.stringify(fn(getSnapshot() ?? EMPTY_PLAN))), []);
  const clear = useCallback(() => writeRaw(null), []);
  return { plan, update, clear };
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14));
