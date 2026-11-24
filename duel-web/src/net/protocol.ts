import { parseReceivedSkin, type SkinMessage } from "@optcg/duel-protocol";
import { getApiBaseUrl } from "../config";

export * from "@optcg/duel-protocol";
export type { ReceivedErrorMessage as ErrorMessage } from "@optcg/duel-protocol";

export function parseSkin(raw: unknown): SkinMessage {
  return parseReceivedSkin(raw, (path) => `${getApiBaseUrl()}${path}`);
}
