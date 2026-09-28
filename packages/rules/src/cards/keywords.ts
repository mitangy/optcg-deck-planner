import { hasPrintedKeyword } from "./abilities.js";

export function cardHasUnconditionalKeyword(cardId: string, keyword: "blocker" | "rush"): boolean {
  return hasPrintedKeyword(cardId, keyword);
}
