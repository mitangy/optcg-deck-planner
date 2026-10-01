/** Runtime config for the Expo duel client. */

export const PROTOCOL_VERSION = 5 as const;

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

/**
 * Floating-card searches and effect ordering in live matches (prototype, off
 * by default like duel-web's `/demo?float`). The `/demo` screen always shows them.
 */
export function floatingPromptsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FLOATING_PROMPTS === "true";
}
