import { useSyncExternalStore } from "react";

/**
 * Review decisions made in this browser. The API records each decision (POST /api/review) but
 * GET /api/cards does not reflect it yet, so we remember decided card ids locally to keep the
 * queue consistent across reloads.
 */
export interface Decision { decision: "accept" | "reject"; note: string; ts: string }

const KEY = "sv.reviews";
let cache: Record<string, Decision> = load();
const listeners = new Set<() => void>();

function load(): Record<string, Decision> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function recordDecision(cardId: string, d: Decision) {
  cache = { ...cache, [cardId]: d };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* session only */ }
  listeners.forEach((l) => l());
}

export function clearDecisions() {
  cache = {};
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useDecisions(): Record<string, Decision> {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => cache,
  );
}

export const SAFETY_CHANGED = "sv:safety-changed";
