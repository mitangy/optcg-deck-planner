import { getApiBaseUrl, getDuelIngestSecret, getLogLevel } from "./env.js";

export type MatchResultPayload = {
  match_id: string;
  seat0_user_id: number;
  seat1_user_id: number;
  winner_seat: 0 | 1;
  reason: string;
  ranked: boolean;
};

export async function postMatchResult(payload: MatchResultPayload): Promise<void> {
  const url = `${getApiBaseUrl()}/duel/matches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Duel-Ingest-Token": getDuelIngestSecret(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      log("warn", "match_ingest_failed", {
        status: res.status,
        body: text.slice(0, 200),
        matchId: payload.match_id,
      });
      return;
    }
    log("info", "match_ingest_ok", { matchId: payload.match_id });
  } catch (e) {
    log("warn", "match_ingest_error", {
      matchId: payload.match_id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function log(level: "info" | "warn", event: string, data: Record<string, unknown>) {
  const configured = getLogLevel();
  const order = { debug: 0, info: 1, warn: 2 } as const;
  if (order[level] < order[configured]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  if (level === "warn") console.warn(line);
  else console.log(line);
}
