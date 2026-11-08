import { describe, expect, it, vi } from "vitest";
import { runChat, runReview } from "./chat";
import { lifeTakenGame } from "./testFixtures";
import { BUDGET, deps, planner, scriptedModel, usage } from "./testkit";

const { replay, taken } = lifeTakenGame();

describe("spend bookkeeping failures are visible (refactor 0.3)", () => {
  const toolUse = { type: "tool_use", id: "t1", name: "get_cards", input: { ids: ["OP01-001"] } };
  const done = () => scriptedModel([{ content: [{ type: "text", text: "Ahoy." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
  const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (typeof c[0] === "string" && c[0].startsWith("{") ? JSON.parse(c[0]) : null)).filter(Boolean) as Record<string, any>[];
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("retries a failed usage write once, then logs it with the route, status and user but no secret (refactor 0.3)", async () => {
    const spy = quiet();
    const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "GET /analyst/chat/budget": BUDGET, "POST /analyst/chat/usage": [500] });
    await runChat(deps(api, done().callModel), "chat.42.2.sig", { message: "Hi" }, () => {}, new AbortController().signal);
    expect(calls.filter((c) => c.url.endsWith("/chat/usage"))).toHaveLength(2);
    const [row] = logged(spy).filter((l) => l.event === "usage_record_failed");
    expect(row).toMatchObject({ event: "usage_record_failed", route: "/analyst/chat/usage", status: 500, user: "42", kind: "chat", attempts: 2 });
    expect(JSON.stringify(row)).not.toMatch(/svc|Hi|sig/);
    spy.mockRestore();
  });

  it("does not log when the retry of a usage write succeeds (refactor 0.3)", async () => {
    const spy = quiet();
    const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "GET /analyst/chat/budget": BUDGET, "POST /analyst/chat/usage": [new TypeError("fetch failed"), null] });
    await runChat(deps(api, done().callModel), "chat.42.2.sig", { message: "Hi" }, () => {}, new AbortController().signal);
    expect(calls.filter((c) => c.url.endsWith("/chat/usage"))).toHaveLength(2);
    expect(logged(spy).filter((l) => l.event === "usage_record_failed")).toEqual([]);
    spy.mockRestore();
  });

  it("does not retry a usage write the planner refused with a 4xx, but still logs it (refactor 0.3)", async () => {
    const spy = quiet();
    const { calls, api } = planner({ "POST /analyst/chat/threads": { id: 9 }, "POST /analyst/chat/threads/9/messages": null, "GET /analyst/chat/budget": BUDGET, "POST /analyst/chat/usage": [422] });
    await runChat(deps(api, done().callModel), "chat.42.2.sig", { message: "Hi" }, () => {}, new AbortController().signal);
    expect(calls.filter((c) => c.url.endsWith("/chat/usage"))).toHaveLength(1);
    expect(logged(spy).filter((l) => l.event === "usage_record_failed")).toMatchObject([{ status: 422, attempts: 1 }]);
    spy.mockRestore();
  });

  it("logs a failed review usage write too (refactor 0.3)", async () => {
    const spy = quiet();
    const { api } = planner({
      "GET /analyst/matches/m1/replay": { match_id: "m1", your_seat: taken.seat, replay },
      "GET /analyst/chat/budget": BUDGET,
      "POST /analyst/chat/usage": [new TypeError("fetch failed")],
      "PUT /analyst/reviews/m1": { match_id: "m1", text: "x", created_at: null },
    });
    const model = scriptedModel([{ content: [{ type: "text", text: "You lost." }], stop_reason: "end_turn", usage: usage(10, 10) }]);
    await runReview(deps(api, model.callModel), "chat.42.2.sig", { match_id: "m1" }, () => {}, new AbortController().signal);
    expect(logged(spy).some((l) => l.event === "usage_record_failed" && l.kind === "review")).toBe(true);
    spy.mockRestore();
  });

  it("keeps answering but logs refusal_check_failed_open when the mid-answer cap check fails (refactor 0.3)", async () => {
    const spy = quiet();
    const { api } = planner({
      "POST /analyst/chat/threads": { id: 9 },
      "POST /analyst/chat/threads/9/messages": null,
      "POST /analyst/chat/usage": null,
      "GET /analyst/chat/budget": BUDGET,
    });
    // The extra= check answers 503; the first (plain) budget read answers normally.
    const fetchImpl = api.fetchImpl;
    const flaky = (async (url: string, init: RequestInit) => (url.includes("extra=") ? new Response("{}", { status: 503 }) : fetchImpl(url, init))) as unknown as typeof fetch;
    const { callModel, seen } = scriptedModel([
      { content: [toolUse], stop_reason: "tool_use", usage: usage(1000, 100) },
      { content: [{ type: "text", text: "Done." }], stop_reason: "end_turn", usage: usage(1000, 100) },
    ]);
    await runChat(deps({ ...api, fetchImpl: flaky }, callModel), "chat.42.2.sig", { message: "Hi" }, () => {}, new AbortController().signal);
    expect(seen).toHaveLength(2);
    expect(logged(spy).filter((l) => l.event === "refusal_check_failed_open")).toMatchObject([{ route: "/analyst/chat/budget", status: 503, user: "42" }]);
    spy.mockRestore();
  });
});
