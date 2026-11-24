import type { Intent } from "../../net/protocol";

export type PlayCardIntent = Extract<Intent, { type: "play_card" }>;

export function handIndexOf(intent: Intent): number | undefined {
  return "handIndex" in intent && typeof intent.handIndex === "number" ? intent.handIndex : undefined;
}
