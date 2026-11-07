/**
 * The service's settings, read from the environment once at start-up. `createApp` takes a `Config`, so a test can
 * build one by hand instead of setting process.env.
 */

export const DEFAULT_PLANNER_API_URL = "https://optcg-deck-planner.app/api";
const DEFAULT_CHAT_ORIGINS = "https://optcgduel.app,https://optcg-deck-planner.app";

/** The Claude client's limits, spelled out (these equal the SDK's defaults for a streamed call). */
export const ANTHROPIC_TIMEOUT_MS = 10 * 60_000;
export const ANTHROPIC_MAX_RETRIES = 2;

export type Config = {
  port: number;
  /** The secret path segment of the connector URL; empty (local dev) allows every request. */
  connectorKey: string;
  plannerApiUrl: string;
  /** Lets the service read the planner's stats and write chat usage; the chat is off without it. */
  serviceSecret: string;
  /** Overrides the official-rules site, for tests and mirrors. */
  officialSiteUrl: string | undefined;
  /** The Claude API key; the in-app chat is off without it. */
  anthropicKey: string;
  /** Browser origins allowed to call /chat, /review-match and /brief (Vercel previews and localhost are always allowed). */
  chatOrigins: string[];
};

/** The planner API's base URL, with the same default everywhere it is read. */
export const plannerApiUrlFrom = (env: NodeJS.ProcessEnv): string => env.PLANNER_API_URL ?? DEFAULT_PLANNER_API_URL;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    connectorKey: env.ANALYST_CONNECTOR_KEY ?? "",
    plannerApiUrl: plannerApiUrlFrom(env),
    serviceSecret: env.ANALYST_SERVICE_SECRET ?? "",
    officialSiteUrl: env.OFFICIAL_SITE_URL || undefined,
    anthropicKey: env.ANTHROPIC_API_KEY ?? "",
    chatOrigins: (env.ANALYST_CHAT_ORIGINS ?? DEFAULT_CHAT_ORIGINS)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
