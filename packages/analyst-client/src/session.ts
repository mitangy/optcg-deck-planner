export type AccessState = "none" | "pending" | "denied";

export type ChatSession =
  | {
      enabled: false;
      access?: AccessState;
      freeSpots?: number;
      spotsLeft?: number;
      freeCreditUsd?: number;
    }
  | { enabled: true; token: string; expires_at: string; chat_url: string; owner?: boolean; pendingRequests?: number };

export function parseAccess(value: unknown): AccessState | undefined {
  return value === "none" || value === "pending" || value === "denied" ? value : undefined;
}

export type ChatAuth = { token: string; chatUrl: string };

export const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export function needsRefresh(expiresAt: string, now: number = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return true;
  return at - now < REFRESH_MARGIN_MS;
}

export async function fetchChatSession(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<ChatSession> {
  try {
    const res = await fetchImpl(`${apiBase}/analyst/chat/session`, { method: "POST", credentials: "include" });
    if (!res.ok) return { enabled: false };
    const body = (await res.json()) as Partial<{
      enabled: boolean;
      token: string;
      expires_at: string;
      chat_url: string;
      access: unknown;
      owner: unknown;
      pending_requests: unknown;
      free_spots: unknown;
      spots_left: unknown;
      free_credit_usd: unknown;
    }>;
    if (body.enabled !== true || !body.token || !body.chat_url || !body.expires_at) {
      const access = parseAccess(body.access);
      if (!access) return { enabled: false };
      const out: ChatSession = { enabled: false, access };
      const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);
      const freeSpots = count(body.free_spots);
      const spotsLeft = count(body.spots_left);
      if (freeSpots !== undefined) out.freeSpots = freeSpots;
      if (spotsLeft !== undefined) out.spotsLeft = spotsLeft;
      if (typeof body.free_credit_usd === "number" && body.free_credit_usd > 0) out.freeCreditUsd = body.free_credit_usd;
      return out;
    }
    const out: ChatSession = { enabled: true, token: body.token, expires_at: body.expires_at, chat_url: body.chat_url.replace(/\/+$/, "") };
    if (body.owner === true) {
      out.owner = true;
      if (typeof body.pending_requests === "number" && Number.isFinite(body.pending_requests) && body.pending_requests > 0) {
        out.pendingRequests = Math.floor(body.pending_requests);
      }
    }
    return out;
  } catch {
    return { enabled: false };
  }
}

export type SessionManager = {
  current(): ChatSession | null;
  refresh(): Promise<ChatSession>;
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
