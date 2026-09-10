/** Runtime config for the duel-web Vite SPA. */

export const PROTOCOL_VERSION = 1 as const;

/** Colyseus HTTP(S) endpoint; SDK derives WS/WSS. */
export function getGameServerUrl(): string {
  return import.meta.env.VITE_GAME_SERVER_URL ?? "http://localhost:2567";
}

export function getApiBaseUrl(): string {
  // Default host must match backend BACKEND_PUBLIC_URL (localhost, not 127.0.0.1)
  // so OAuth nonce cookies survive the Google redirect round-trip.
  return (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

export function getDevJoinSecret(): string | undefined {
  const s = import.meta.env.VITE_DEV_JOIN_SECRET;
  return s && s.length > 0 ? s : undefined;
}
