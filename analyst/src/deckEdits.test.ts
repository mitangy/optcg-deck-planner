import { describe, expect, it } from "vitest";
import { MAX_TOOL_ROUNDS, runChat, type SseEvent } from "./chat";
import { BUDGET, deps, planner, scriptedModel, usage } from "./testkit";

describe("deck edit suggestions (#400)", () => {
  const MAIN = [
    ...["ST01-003", "ST01-004", "ST01-005", "ST01-006", "ST01-007", "ST01-008", "ST01-009", "ST01-010", "ST01-011", "ST01-012", "ST01-013", "ST01-014"].map((id) => ({ id, copies: 4 })),
    { id: "ST01-015", copies: 2 },
  ];
  const propose = { type: "tool_use", id: "t1", name: "propose_deck_edit", input: { summary: "Trim the event", changes: [{ id: "ST01-016", delta: 2, reason: "Cheaper" }, { id: "ST01-015", delta: -2, reason: "Too slow" }] } };
  const body = { message: "Review this deck", context: { app: "duel" as const, deck: { name: "Luffy", leaderId: "ST01-001", ref: "duel:d1", cards: MAIN } } };
  const run = async (save: boolean) => {
    const { calls, api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/threads/9/proposals": save ? null : 500,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { seen, callModel } = scriptedModel([
      { content: [propose], stop_reason: "tool_use", usage: usage(10, 5) },
      { content: [{ type: "text", text: "See the card." }], stop_reason: "end_turn", usage: usage(10, 5) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    return { calls, seen, events };
  };

  it("streams a deck edit as a proposal event and saves it after the turn (#400)", async () => {
    const { calls, events } = await run(true);
    const proposal = events.find((e) => e.event === "proposal")!;
    expect(proposal.data).toMatchObject({
      id: "t1",
      version: 1,
      target: { ref: "duel:d1", name: "Luffy", leader_id: "ST01-001" },
      lines: [
        { id: "ST01-016", before: 0, after: 2 },
        { id: "ST01-015", before: 2, after: 0 },
      ],
      legality: { legal: true, count: 50 },
    });
    expect(events.map((e) => e.event)).toEqual(["thread", "status", "proposal", "text", "done"]);
    // The proposals are saved after the turn's messages.
    const urls = calls.map((c) => c.url.replace("https://api.test", ""));
    expect(urls.indexOf("/analyst/chat/threads/9/proposals")).toBeGreaterThan(urls.indexOf("/analyst/chat/threads/9/messages"));
    expect(calls.find((c) => c.url.endsWith("/threads/9/proposals"))!.body).toEqual({ proposals: [proposal.data] });
  });

  it("sends the deck edit back to the model as search results only, never mixed with text (#400)", async () => {
    const { seen } = await run(true);
    const result = seen[1]!.messages.at(-1).content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content.every((b: { type: string }) => b.type === "search_result")).toBe(true);
    expect(result.content[0].source).toMatch(/^deck:/);
  });

  it("still finishes the turn when saving the proposal fails (#400)", async () => {
    const { calls, events } = await run(false);
    expect(events.at(-1)!.event).toBe("done");
    expect(calls.some((c) => c.url.endsWith("/threads/9/messages"))).toBe(true);
  });

  it("never shows the app's deck ref to the model (#400)", async () => {
    const { seen } = await run(true);
    expect(JSON.stringify(seen[0]!.messages)).not.toContain("duel:d1");
  });

  it("gives a refused edit no card and tells the model why (#400)", async () => {
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const bad = { ...propose, input: { summary: "Add one", changes: [{ id: "ST01-016", delta: 1, reason: "More" }] } };
    const { seen, callModel } = scriptedModel([
      { content: [bad], stop_reason: "tool_use", usage: usage(1, 1) },
      { content: [{ type: "text", text: "Ok." }], stop_reason: "end_turn", usage: usage(1, 1) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    expect(events.some((e) => e.event === "proposal")).toBe(false);
    expect(seen[1]!.messages.at(-1).content[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/51 of 50/) });
  });

  it("passes the apply flag through on the proposal event (#726)", async () => {
    const applied = { ...propose, input: { ...propose.input, apply: true } };
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/threads/9/proposals": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    const { callModel } = scriptedModel([
      { content: [applied], stop_reason: "tool_use", usage: usage(1, 1) },
      { content: [{ type: "text", text: "Making it now." }], stop_reason: "end_turn", usage: usage(1, 1) },
    ]);
    const events: SseEvent[] = [];
    await runChat(deps(api, callModel), "chat.tok", body, (e) => events.push(e), new AbortController().signal);
    expect(events.find((e) => e.event === "proposal")!.data).toMatchObject({ id: "t1", apply: true });
    const { events: plain } = await run(true);
    expect(plain.find((e) => e.event === "proposal")!.data).toMatchObject({ apply: false });
  });

  describe("app check of +N / -N lines (#686)", () => {
    const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: usage(1, 1) });
    const checkOf = (m: Record<string, any>) => (m.content as { text: string }[]).map((b) => b.text).join("");
    const turn = async (replies: Parameters<typeof scriptedModel>[0], b: typeof body | { message: string; context: { app: "duel" } } = body) => {
      const { api } = planner({
        "POST /analyst/chat/threads": { id: 9 },
        "POST /analyst/chat/threads/9/messages": null,
        "POST /analyst/chat/threads/9/proposals": null,
        "POST /analyst/chat/usage": null,
        "GET /analyst/chat/budget": BUDGET,
      });
      const { seen, callModel } = scriptedModel(replies);
      const events: SseEvent[] = [];
      await runChat(deps(api, callModel), "chat.tok", b, (e) => events.push(e), new AbortController().signal);
      return { seen, events };
    };
    const lastUser = (seen: Record<string, any>[], call: number) => seen[call]!.messages.at(-1);
    const checks = (seen: Record<string, any>[]) => seen.flatMap((c) => c.messages).filter((m) => m.role === "user" && checkOf(m).includes("app check:")).length;

    it("checks +N / -N lines in an answer with an open deck and asks for a legal Apply card (#686)", async () => {
      const { seen, events } = await turn([text("Add a copy:\n+1 ST01-016"), { content: [propose], stop_reason: "tool_use", usage: usage(1, 1) }, text("Done.")]);
      expect(seen).toHaveLength(3);
      const message = lastUser(seen, 1);
      expect(message.role).toBe("user");
      expect(checkOf(message)).toMatch(/^<context>\n/);
      expect(checkOf(message)).toMatch(/51 of 50/);
      expect(checkOf(message)).toMatch(/propose_deck_edit/);
      expect(events.some((e) => e.event === "proposal")).toBe(true);
      expect(events.at(-1)!.event).toBe("done");
    });

    it("tells the model lines that keep the deck legal do (#686)", async () => {
      const { seen } = await turn([text("Swap:\n+2 ST01-016\n-2 ST01-015"), text("Ok.")]);
      expect(checkOf(lastUser(seen, 1))).toMatch(/keep the deck legal/);
      expect(checkOf(lastUser(seen, 1))).not.toMatch(/of 50 cards/);
    });

    it("sends no check when the answer has no +N / -N lines (#686)", async () => {
      const { seen } = await turn([text("Keep the list as it is.")]);
      expect(seen).toHaveLength(1);
    });

    it("sends no check after a proposal was made this turn (#686)", async () => {
      const { seen } = await turn([{ content: [propose], stop_reason: "tool_use", usage: usage(1, 1) }, text("See the card.\n+1 ST01-016")]);
      expect(seen).toHaveLength(2);
      expect(checks(seen)).toBe(0);
    });

    it("sends no check when no deck is open (#686)", async () => {
      const { seen } = await turn([text("Add a copy:\n+1 ST01-016")], { message: "Tune my deck", context: { app: "duel" } });
      expect(seen).toHaveLength(1);
    });

    it("checks only once per turn (#686)", async () => {
      const { seen, events } = await turn([text("+1 ST01-016"), text("Still:\n+1 ST01-016"), text("No more checks.")]);
      expect(seen).toHaveLength(2);
      expect(checks(seen)).toBe(1);
      expect(events.at(-1)!.event).toBe("done");
    });

    it("sends no check when it would take the turn past the round limit (#686)", async () => {
      const refusedCall = (i: number) => ({ content: [{ ...propose, id: `t${i}`, input: { summary: "Nope", changes: [{ id: "ZZ99-999", delta: 1, reason: "Unknown" }] } }], stop_reason: "tool_use", usage: usage(1, 1) });
      const replies = [...Array.from({ length: MAX_TOOL_ROUNDS - 1 }, (_, i) => refusedCall(i)), text("+1 ST01-016"), text("never asked")];
      const { seen, events } = await turn(replies);
      expect(seen).toHaveLength(MAX_TOOL_ROUNDS);
      expect(checks(seen)).toBe(0);
      expect(events.at(-1)!.event).toBe("done");
    });

    it("a +N/-N answer one round before the limit still finishes (#692)", async () => {
      const refusedCall = (i: number) => ({ content: [{ ...propose, id: `t${i}`, input: { summary: "Nope", changes: [{ id: "ZZ99-999", delta: 1, reason: "Unknown" }] } }], stop_reason: "tool_use", usage: usage(1, 1) });
      const replies = [...Array.from({ length: MAX_TOOL_ROUNDS - 2 }, (_, i) => refusedCall(i)), text("+1 ST01-016"), { content: [propose], stop_reason: "tool_use", usage: usage(1, 1) }];
      const { events } = await turn(replies);
      expect(events.at(-1)!.event).toBe("done");
    });
  });
});
