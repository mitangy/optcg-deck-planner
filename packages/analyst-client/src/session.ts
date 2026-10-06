/** The chat session: a short-lived token for the analyst service, minted by the API (cookie auth). */

export type ChatSession =
  | { enabled: false }
  | { enabled: true; token: string; expires_at: string; chat_url: string };

/** What a request to the analyst service needs. */
export type ChatAuth = { token: string; chatUrl: string };

/** Refresh the token when it has less than this left. */
export const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** True when a token expiring at `expiresAt` (ISO) should be replaced before use. */
export function needsRefresh(expiresAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return true;
  return at - now < REFRESH_MARGIN_MS;
}

/** POST {apiBase}/analyst/chat/session. Signed out (401), errors and odd bodies all mean "off". */
export async function fetchChatSession(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<ChatSession> {
  try {
    const res = await fetchImpl(`${apiBase}/analyst/chat/session`, { method: "POST", credentials: "include" });
    if (!res.ok) return { enabled: false };
    const body = (await res.json()) as Partial<{ enabled: boolean; token: string; expires_at: string; chat_url: string }>;
    if (body.enabled !== true || !body.token || !body.chat_url || !body.expires_at) return { enabled: false };
    return { enabled: true, token: body.token, expires_at: body.expires_at, chat_url: body.chat_url.replace(/\/+$/, "") };
  } catch {
    return { enabled: false };
  }
}

export type SessionManager = {
  /** The current session (null until the first answer). */
  current(): ChatSession | null;
  /** Loads the session (again). */
  refresh(): Promise<ChatSession>;
  /**
   * Token + chat URL for one request. Refreshes first when the token is within
   * REFRESH_MARGIN_MS of expiry, or always when `force` (after a 401). Null when chat is off.
   */
  getAuth(force?: boolean): Promise<ChatAuth | null>;
};

export function createSessionManager(
  apiBase: string,
  onChange: (s: ChatSession) => void = () => {},
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): SessionManager {
  let session: ChatSession | null = null;
  let inflight: Promise<ChatSession> | null = null;

  const refresh = () => {
    inflight ??= fetchChatSession(apiBase, fetchImpl)
      .then((s) => {
        session = s;
        onChange(s);
        return s;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    current: () => session,
    refresh,
    async getAuth(force = false) {
      let s = session;
      if (!s || force || (s.enabled && needsRefresh(s.expires_at, now()))) s = await refresh();
      return s.enabled ? { token: s.token, chatUrl: s.chat_url } : null;
    },
  };
}
