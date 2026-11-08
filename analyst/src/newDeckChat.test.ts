import { describe, expect, it } from "vitest";
import { runChat, type SseEvent } from "./chat";
import { BUDGET, deps, planner, scriptedModel, usage } from "./testkit";

describe("Log Pose builds a new deck (#726)", () => {
  const MAIN = [
    ...["ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013", "ST01-014"].map((id) => ({ id, copies: 4 })),
    { id: "ST01-015", copies: 2 },
  ];
  const build = { type: "tool_use", id: "d1", name: "propose_new_deck", input: { name: "Red Luffy", leader_id: "ST01-001", cards: MAIN, summary: "Plain red beats." } };
  // A new deck needs no open deck: the player can ask from any page.
  const body = { message: "Build me a red Luffy deck", context: { app: "planner" as const } };
  const run = async (save: boolean, call: typeof build = build) => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/threads/9/drafts": save ? null : 500,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([
      { content: [call], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "Opening the deck builder." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    return { calls, seen, events };
  };

  it("streams the deck as a deck_draft event and saves it after the turn (#726)", async () => {
    const { calls, events } = await run(true);
    const draft = events.find((e) => e.event === "deck_draft")!;
    expect(draft.data).toMatchObject({ id: "d1", version: 1, name: "Red Luffy", leader_id: "ST01-001", count: 50, legality: { legal: true } });
    expect(events.map((e) => e.event)).toEqual(["thread", "status", "deck_draft", "text", "done"]);
    const urls = calls.map((c) => c.url.replace("https://api.test", ""));
    expect(urls.indexOf("/analyst/chat/threads/9/drafts")).toBeGreaterThan(urls.indexOf("/analyst/chat/threads/9/messages"));
    expect(calls.find((c) => c.url.endsWith("/threads/9/drafts"))!.body).toEqual({ drafts: [draft.data] });
  });

  it("still finishes the turn when saving the draft fails (#726)", async () => {
    const { calls, events } = await run(false);
    expect(events.at(-1)!.event).toBe("done");
    expect(calls.some((c) => c.url.endsWith("/threads/9/messages"))).toBe(true);
  });

  it("gives a refused deck no card and tells the model why (#726)", async () => {
    const short = { ...build, input: { ...build.input, cards: MAIN.slice(0, 12) } };
    const { seen, events } = await run(true, short);
    expect(events.some((e) => e.event === "deck_draft")).toBe(false);
    expect(seen[1]!.messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/48 of 50/) });
  });
});
