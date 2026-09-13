/** Runtime config for the Expo duel client. */

export const PROTOCOL_VERSION = 2 as const;

/** Colyseus HTTP endpoint; SDK derives the WebSocket URL. */
export function getGameServerUrl(): string {
  return process.env.EXPO_PUBLIC_GAME_SERVER_URL ?? "http://localhost:2567";
}

export function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

export function getDevJoinSecret(): string | undefined {
  const s = process.env.EXPO_PUBLIC_DEV_JOIN_SECRET;
  return s && s.length > 0 ? s : undefined;
}
