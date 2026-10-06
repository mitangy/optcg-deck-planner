import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedbackPayload, feedbackMessageError } from "@optcg/site-legal/feedback";
import { submitFeedback } from "./feedback";
import { noteMatchGameToken, noteMatchRoom } from "./matchContext";

const PAYLOAD = buildFeedbackPayload("bug", "  The menu will not close.  ", {
  pathname: "/demo",
  innerWidth: 390,
  innerHeight: 844.4,
  userAgent: "UA",
});

function fetchReturning(status: number) {
  return vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function sent(fetchImpl: ReturnType<typeof vi.fn>) {
  const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return {
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, string>,
  };
}

describe("feedback payload (#371)", () => {
  it("trims the message and rounds the viewport", () => {
    expect(PAYLOAD).toMatchObject({ message: "The menu will not close.", viewport: "390x844", page: "/demo" });
  });

  it("treats a padded short message as too short, like the API (#371)", () => {
    expect(feedbackMessageError("   broken        ")).toMatch(/at least 10 characters/);
    expect(feedbackMessageError("x".repeat(2001))).toMatch(/under 2000/);
    expect(feedbackMessageError("  ten chars!  ")).toBeNull();
  });

  it("keeps share and group-buy tokens out of the stored page (#371)", () => {
    const page = (pathname: string) => buildFeedbackPayload("bug", "long enough text", { pathname, innerWidth: 1, innerHeight: 1, userAgent: "" }).page;
    expect(page("/share/s3cr3t-token")).toBe("/share/:token");
    expect(page("/group-buy/join/abc123")).toBe("/group-buy/join/:token");
    expect(page("/group-buy/view/abc123")).toBe("/group-buy/view/:token");
    expect(page("/decks/12")).toBe("/decks/12");
  });

  it("cuts the user agent to the API's 300 characters (#371)", () => {
    const p = buildFeedbackPayload("bug", "long enough text", { pathname: "/", innerWidth: 1, innerHeight: 1, userAgent: "u".repeat(400) });
    expect(p.user_agent).toHaveLength(300);
  });
});

describe("submitFeedback (#371)", () => {
  beforeEach(() => noteMatchRoom(undefined));

  it("identifies the sender with the match game token and tags the room", async () => {
    noteMatchGameToken("guest-token.sig");
    noteMatchRoom("room-9");
    const fetchImpl = fetchReturning(201);
    await submitFeedback(PAYLOAD, fetchImpl);
    const { headers, body } = sent(fetchImpl);
    expect(headers.Authorization).toBe("Bearer guest-token.sig");
    expect(body).toMatchObject({ app: "duel", room_id: "room-9", kind: "bug", message: "The menu will not close." });
  });

  it("sends no room id when not in a match", async () => {
    const fetchImpl = fetchReturning(201);
    await submitFeedback(PAYLOAD, fetchImpl);
    expect(sent(fetchImpl).body.room_id).toBe("");
  });

  it("explains a rate limit, and other failures with their status", async () => {
    await expect(submitFeedback(PAYLOAD, fetchReturning(429))).rejects.toThrow(/sent a lot of feedback/);
    await expect(submitFeedback(PAYLOAD, fetchReturning(500))).rejects.toThrow(/Could not send feedback \(500\)/);
  });
});
