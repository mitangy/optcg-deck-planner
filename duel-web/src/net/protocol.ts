/**
 * The wire protocol as duel-web uses it. Types, constants and parsers live in @optcg/duel-protocol (shared with
 * the game server); this module re-exports them so the app has one import path, and adds the one thing that
 * needs app config: resolving an account upload's API-relative path (`parseSkin`).
 *
 * The protocol package reaches @optcg/rules through `import type` only. Do not import @optcg/rules at runtime
 * into the app, except through the lazy replay chunk (src/replay), which loads the engine on /replay only;
 * the main bundle must stay free of rules data.
 */
import { parseReceivedSkin, type SkinMessage } from "@optcg/duel-protocol";
import { getApiBaseUrl } from "../config";

export * from "@optcg/duel-protocol";
export type { ReceivedErrorMessage as ErrorMessage } from "@optcg/duel-protocol";

/** A received skin, with an account upload's path resolved against the API base so it is ready for CSS `url(...)`. */
export function parseSkin(raw: unknown): SkinMessage {
  return parseReceivedSkin(raw, (path) => `${getApiBaseUrl()}${path}`);
}
