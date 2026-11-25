import { describe, expect, it } from "vitest";
import { runChat, type SseEvent } from "./chat";
import { BUDGET, deps, planner, scriptedModel, usage } from "./testkit";

describe("Log Pose shows a card list (#1450)", () => {
  const show = (id = "c1") => ({ type: "tool_use", id, name: "show_cards", input: { title: "Red Straw Hats", cards: [{ id: "OP01-022", reason: "-2000 power" }, { id: "ST29-015" }] } });
  const run = async (opts: { save?: boolean; app?: "planner" | "duel"; deck?: boolean } = {}) => {
    const { save = true, app = "planner", deck = true } = opts;
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/threads/9/card_lists": save ? null : 500,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([
      { content: [show()], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "These two match." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const events: SseEvent[] = [];
    const context = { app, ...(deck ? { deck: { name: "Luffy", leaderId: "OP01-001", cards: [] } } : {}) };
    await runChat(deps(api, callModel), "chat.tok", { message: "red or yellow Straw Hat Crew that give -power", context }, (e) => events.push(e), new AbortController().signal);
    return { calls, seen, events };
  };

  it("streams the list as a card_list event without the cards the open leader can't use, and saves it after the turn (#1450)", async () => {
    const { calls, events } = await run();
    const list = events.find((e) => e.event === "card_list")!;
    expect(list.data).toMatchObject({ id: "c1", kind: "card_list", title: "Red Straw Hats", leader_id: "OP01-001" });
    expect((list.data.cards as { id: string }[]).map((c) => c.id)).toEqual(["OP01-022"]);
    expect(list.data).not.toHaveProperty("dropped");
    expect(events.map((e) => e.event)).toEqual(["thread", "status", "card_list", "text", "done"]);
    const urls = calls.map((c) => c.url.replace("https://api.test", ""));
    expect(urls.indexOf("/analyst/chat/threads/9/card_lists")).toBeGreaterThan(urls.indexOf("/analyst/chat/threads/9/messages"));
    expect(calls.find((c) => c.url.endsWith("/threads/9/card_lists"))!.body).toEqual({ card_lists: [list.data] });
  });

  it("tells the model the list is on screen and which card was left out (#1450)", async () => {
    const { seen } = await run();
    const result = seen[1]!.messages.at(-1).content[0];
    expect(result.is_error).toBeUndefined();
    expect(JSON.stringify(result.content)).toMatch(/Left out because the open deck's leader can't use them: ST29-015/);
  });

  it("still finishes the turn when saving the list fails (#1450)", async () => {
    const { calls, events } = await run({ save: false });
    expect(events.at(-1)!.event).toBe("done");
    expect(calls.some((c) => c.url.endsWith("/threads/9/messages"))).toBe(true);
  });

  it("gives the duel app a card list too, saved with the thread (#1456)", async () => {
    const { events, seen, calls } = await run({ app: "duel" });
    expect(events.find((e) => e.event === "card_list")!.data).toMatchObject({ kind: "card_list", title: "Red Straw Hats", cards: [{ id: "OP01-022" }] });
    expect(calls.some((c) => c.url.endsWith("/threads/9/card_lists"))).toBe(true);
    expect(seen[1]!.messages.at(-1).content[0].is_error).toBeUndefined();
  });

  it("keeps every card when no deck is open (#1450)", async () => {
    const { events } = await run({ deck: false });
    expect(events.find((e) => e.event === "card_list")!.data).toMatchObject({ leader_id: null, cards: [{ id: "OP01-022" }, { id: "ST29-015" }] });
  });

  it("match brief search_cards can find the opponent's cards (#1463)", async () => {
    const { api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "POST /analyst/chat/usage": null, "GET /analyst/chat/budget": BUDGET });
    const search = { type: "tool_use", id: "s1", name: "search_cards", input: { colors: ["red", "yellow"], traits: ["Straw Hat Crew"], effects: ["power_down"], limit: 100 } };
    const { seen, callModel } = scriptedModel([
      { content: [search], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "Found some." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const context = { app: "duel" as const, page: "match-brief", deck: { name: "Luffy", leaderId: "OP01-001", cards: [] } };
    await runChat(deps(api, callModel), "chat.tok", { message: "what does the opponent play", context }, () => undefined, new AbortController().signal);
    const result = JSON.stringify(seen[1]!.messages.at(-1).content);
    expect(result).toContain("OP01-022");
    expect(result).toContain("ST29-015");
  });

  it("searches for the model without the cards the open deck's leader can't use (#1450)", async () => {
    const { api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "POST /analyst/chat/usage": null, "GET /analyst/chat/budget": BUDGET });
    const search = { type: "tool_use", id: "s1", name: "search_cards", input: { colors: ["red", "yellow"], traits: ["Straw Hat Crew"], effects: ["power_down"], limit: 100 } };
    const { seen, callModel } = scriptedModel([
      { content: [search], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "Found some." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const context = { app: "planner" as const, deck: { name: "Luffy", leaderId: "OP01-001", cards: [] } };
    await runChat(deps(api, callModel), "chat.tok", { message: "find them", context }, () => undefined, new AbortController().signal);
    const result = JSON.stringify(seen[1]!.messages.at(-1).content);
    expect(result).toContain("OP01-022");
    expect(result).not.toContain("ST29-015");
  });
});
