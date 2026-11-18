
export const PROTOCOL_VERSION = 5 as const;

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

export function floatingPromptsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FLOATING_PROMPTS !== "false";
}
