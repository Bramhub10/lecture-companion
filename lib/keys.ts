"use client";

/**
 * "Bring your own keys" storage. Each visitor pastes their own Deepgram and
 * Vercel AI Gateway keys once; we keep them in localStorage (this browser only —
 * they are never stored on our server) and attach them as headers on every AI
 * request so processing runs on the user's own account, not the deployment's.
 */

const DEEPGRAM = "lc:deepgramKey";
const GATEWAY = "lc:gatewayKey";
export const KEYS_CHANGED_EVENT = "lc:keys-changed";

export type ApiKeys = { deepgram: string; gateway: string };

export function getKeys(): ApiKeys {
  if (typeof window === "undefined") return { deepgram: "", gateway: "" };
  return {
    deepgram: localStorage.getItem(DEEPGRAM) || "",
    gateway: localStorage.getItem(GATEWAY) || "",
  };
}

export function saveKeys(keys: ApiKeys): void {
  localStorage.setItem(DEEPGRAM, keys.deepgram.trim());
  localStorage.setItem(GATEWAY, keys.gateway.trim());
  window.dispatchEvent(new Event(KEYS_CHANGED_EVENT));
}

/** Headers to merge into any fetch that hits an AI-backed route. */
export function keyHeaders(): Record<string, string> {
  const { deepgram, gateway } = getKeys();
  const headers: Record<string, string> = {};
  if (deepgram) headers["x-deepgram-key"] = deepgram;
  if (gateway) headers["x-ai-gateway-key"] = gateway;
  return headers;
}
