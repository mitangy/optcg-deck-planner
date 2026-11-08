import type { Intent } from "../../net/protocol";

export type PlayCardIntent = Extract<Intent, { type: "play_card" }>;

/** The hand slot an intent plays or counters with; undefined for intents that name no hand card. */
export function handIndexOf(intent: Intent): number | undefined {
  return "handIndex" in intent && typeof intent.handIndex === "number" ? intent.handIndex : undefined;
}
