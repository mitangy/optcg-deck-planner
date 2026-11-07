/**
 * The system prompt of each in-app mode, assembled in one place. Prompt text is the riskiest thing to edit here
 * (it moves eval scores and prompt-cache hits), so the text lives in this folder, one file per prompt:
 *   connector.ts   shared ground rules + the game primer (also the MCP connector's instructions)
 *   chat.ts        the chat panel     review.ts   the post-game analysis     brief.ts   the matchup brief
 *   copilot.ts     the live-game blocks added after the chat prompt
 * The first block carries the cache breakpoint. The copilot text is a second, uncached block after that cached
 * prefix, so turns without a game keep the same cached prefix.
 */
import { AUTOPILOT_INSTRUCTIONS, COPILOT_INSTRUCTIONS, NO_PLANS_INSTRUCTIONS } from "./copilot";
import { BRIEF_INSTRUCTIONS } from "./brief";
import { CHAT_INSTRUCTIONS } from "./chat";
import { instructionsFor } from "./connector";
import { REVIEW_INSTRUCTIONS } from "./review";

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** What a request is for. `game` is the live game attached to a chat turn, if any. */
export type PromptMode = { kind: "chat"; game?: { plans?: boolean; autopilot?: boolean } } | { kind: "review" } | { kind: "brief" };

export function systemFor(mode: PromptMode): SystemBlock[] {
  const cached = (text: string): SystemBlock => ({ type: "text", text, cache_control: { type: "ephemeral" } });
  switch (mode.kind) {
    case "chat": {
      const game = mode.game;
      return [
        cached(instructionsFor(true) + CHAT_INSTRUCTIONS),
        ...(game ? [{ type: "text" as const, text: game.plans === false ? COPILOT_INSTRUCTIONS + NO_PLANS_INSTRUCTIONS : COPILOT_INSTRUCTIONS + (game.autopilot ? AUTOPILOT_INSTRUCTIONS : "") }] : []),
      ];
    }
    case "review":
      return [cached(instructionsFor(true) + REVIEW_INSTRUCTIONS)];
    case "brief":
      return [cached(instructionsFor(false) + BRIEF_INSTRUCTIONS)];
  }
}
