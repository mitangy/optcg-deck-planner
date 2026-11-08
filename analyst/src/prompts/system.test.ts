import { describe, expect, it } from "vitest";
import { BRIEF_INSTRUCTIONS } from "./brief";
import { CHAT_INSTRUCTIONS } from "./chat";
import { instructionsFor, PERSONAL_INSTRUCTIONS } from "./connector";
import { COPILOT_INSTRUCTIONS } from "./copilot";
import { REVIEW_INSTRUCTIONS } from "./review";
import { systemFor } from "./system";

const EPHEMERAL = { type: "ephemeral" };

describe("system prompts (refactor 3.7a)", () => {
  it("caches the shared prefix of a chat and keeps the live-game block out of it (refactor 3.7a)", () => {
    const chat = systemFor({ kind: "chat" });
    expect(chat).toEqual([{ type: "text", text: instructionsFor(true) + CHAT_INSTRUCTIONS, cache_control: EPHEMERAL }]);
    const withGame = systemFor({ kind: "chat", game: {} });
    expect(withGame).toHaveLength(2);
    expect(withGame[0]).toEqual(chat[0]);
    expect(withGame[1]).toEqual({ type: "text", text: COPILOT_INSTRUCTIONS });
  });

  it("caches a review's prompt with the player's tools and a brief's without them (refactor 3.7a)", () => {
    expect(systemFor({ kind: "review" })).toEqual([{ type: "text", text: instructionsFor(true) + REVIEW_INSTRUCTIONS, cache_control: EPHEMERAL }]);
    const brief = systemFor({ kind: "brief" });
    expect(brief).toEqual([{ type: "text", text: instructionsFor(false) + BRIEF_INSTRUCTIONS, cache_control: EPHEMERAL }]);
    expect(brief[0]!.text).not.toContain(PERSONAL_INSTRUCTIONS);
  });
});
