/**
 * The service's settings, read from the environment once at start-up. `createApp` takes a `Config`, so a test can
 * build one by hand instead of setting process.env.
 */

export const DEFAULT_PLANNER_API_URL = "https://optcg-deck-planner.app/api";
const DEFAULT_CHAT_ORIGINS = "https://optcgduel.app,https://optcg-deck-planner.app";

export const ANTHROPIC_TIMEOUT_MS = 10 * 60_000;
export const ANTHROPIC_MAX_RETRIES = 2;

export type Config = {
  port: number;
  connectorKey: string;
  plannerApiUrl: string;
  serviceSecret: string;
  officialSiteUrl: string | undefined;
  anthropicKey: string;
  /** Browser origins allowed to call /chat, /review-match and /brief (Vercel previews and localhost are always allowed). */
  chatOrigins: string[];
};

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
