/** Runtime config for the duel-web Vite SPA. */

export const PROTOCOL_VERSION = 2 as const;

/**
 * Rewrite `localhost` / `127.0.0.1` in service URLs to the page hostname when
 * the SPA is opened via a LAN / forwarded host. Otherwise the browser would
 * try to reach the user's own machine and hotseat matchmake hangs until the
 * startup watchdog fires.
 */
/** Exported for resume blobs that baked in localhost at save time. */
export function rewriteLoopbackToPageHost(url: string): string {
  if (typeof window === "undefined") return url;
  const pageHost = window.location.hostname;
  if (!pageHost || pageHost === "localhost" || pageHost === "127.0.0.1") {
    return url;
  }
  return url.replace(
    /^(https?:\/\/)(localhost|127\.0\.0\.1)(?=:\d+|\/|$)/,
    `$1${pageHost}`,
  );
}

/** Colyseus HTTP(S) endpoint; SDK derives WS/WSS. */
export function getGameServerUrl(): string {
  const raw = import.meta.env.VITE_GAME_SERVER_URL ?? "http://localhost:2567";
  return rewriteLoopbackToPageHost(raw);
}

export function getApiBaseUrl(): string {
  // Default host must match backend BACKEND_PUBLIC_URL (localhost, not 127.0.0.1)
  // so OAuth nonce cookies survive the Google redirect round-trip.
  const raw = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );
  return rewriteLoopbackToPageHost(raw);
}

export function getDevJoinSecret(): string | undefined {
  const s = import.meta.env.VITE_DEV_JOIN_SECRET;
  return s && s.length > 0 ? s : undefined;
}
