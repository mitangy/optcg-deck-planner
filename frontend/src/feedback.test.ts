import { describe, expect, it, vi } from "vitest";
import { buildFeedbackPayload } from "@optcg/site-legal/feedback";
import { submitFeedback } from "./feedback";

describe("planner submitFeedback (#371)", () => {
  it("posts as the planner with cookies and no room", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    const payload = buildFeedbackPayload("idea", "Add a dark mode toggle please", {
      pathname: "/decks",
      innerWidth: 1440,
      innerHeight: 900,
      userAgent: "UA",
    });
    await submitFeedback(payload, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/feedback$/);
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toMatchObject({ app: "planner", kind: "idea", room_id: "", page: "/decks" });
  });

  it("explains a rate limit", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 429 }));
    const payload = buildFeedbackPayload("bug", "Something is broken here", { pathname: "/", innerWidth: 1, innerHeight: 1, userAgent: "" });
    await expect(submitFeedback(payload, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/sent a lot of feedback/);
  });
});
