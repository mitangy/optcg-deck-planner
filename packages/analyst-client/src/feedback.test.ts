import { describe, expect, it } from "vitest";
import {
  CLOSED_FORM,
  FEEDBACK_BUSY,
  FEEDBACK_ERROR,
  NOTE_MAX,
  answerStart,
  cleanNote,
  feedbackBody,
  fetchVotes,
  formReducer,
  postFeedback,
  statusText,
  targetKey,
  type FeedbackTarget,
} from "./feedback";

const chat: FeedbackTarget = { kind: "chat", threadId: 5, index: 2, startsWith: "Play Zoro" };
const review: FeedbackTarget = { kind: "review", matchId: "m1" };

const respond = (status: number, body: unknown = {}) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

describe("rating an answer", () => {
  it("keys a chat answer by thread and position and a review by game, as the server does (#679)", () => {
    expect(targetKey(chat)).toBe("chat:5:2");
    expect(targetKey(review)).toBe("review:m1");
  });

  it("sends a note only with 'This is wrong', trimmed and cut to the limit (#679)", () => {
    expect(cleanNote("wrong", `  ${"x".repeat(NOTE_MAX + 50)}  `)).toHaveLength(NOTE_MAX);
    expect(cleanNote("wrong", "  costs 4 ")).toBe("costs 4");
    expect(cleanNote("up", "left over from the form")).toBe("");
    expect(cleanNote("down", "left over from the form")).toBe("");
  });

  it("names the thread, the answer's place and its start for a chat answer, and the game for a review (#679)", () => {
    expect(feedbackBody(chat, "wrong", "no")).toEqual({ kind: "chat", thread_id: 5, message_index: 2, starts_with: "Play Zoro", rating: "wrong", note: "no" });
    expect(feedbackBody(review, "up", "")).toEqual({ kind: "review", match_id: "m1", rating: "up", note: "" });
  });

  it("identifies an answer by its first 40 characters with whitespace squeezed (#679)", () => {
    expect(answerStart("  Play   Zoro\non turn 2 and keep the Nami until you can afford the big one")).toBe("Play Zoro on turn 2 and keep the Nami un");
  });

  it("posts with the session cookie and returns the vote that was saved (#679)", async () => {
    const { calls, fetchImpl } = respond(200);
    const vote = await postFeedback("https://api.test", chat, "wrong", " The Nami costs 4. ", fetchImpl);
    expect(vote).toEqual({ rating: "wrong", note: "The Nami costs 4." });
    expect(calls[0]!.url).toBe("https://api.test/analyst/feedback");
    expect(calls[0]!.init.credentials).toBe("include");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ thread_id: 5, rating: "wrong", note: "The Nami costs 4." });
  });

  it("says too many ratings on a 429 and a generic line on any other failure (#679)", async () => {
    await expect(postFeedback("", chat, "up", "", respond(429).fetchImpl)).rejects.toThrow(FEEDBACK_BUSY);
    await expect(postFeedback("", chat, "up", "", respond(409).fetchImpl)).rejects.toThrow(FEEDBACK_ERROR);
    await expect(postFeedback("", chat, "up", "", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toThrow(FEEDBACK_ERROR);
  });
});

describe("the player's earlier votes", () => {
  it("come back keyed by answer, with their notes (#679)", async () => {
    const { calls, fetchImpl } = respond(200, {
      votes: [
        { kind: "chat", thread_id: 5, message_index: 0, rating: "up", note: "" },
        { kind: "chat", thread_id: 5, message_index: 2, rating: "wrong", note: "costs 4" },
        { kind: "review", match_id: "m1", rating: "down", note: "" },
        { kind: "chat", thread_id: 5, message_index: 3, rating: "meh", note: "" },
      ],
    });
    const votes = await fetchVotes("https://api.test", { threadId: 5 }, fetchImpl);
    expect(calls[0]!.url).toBe("https://api.test/analyst/feedback?thread_id=5");
    expect([...votes]).toEqual([
      ["chat:5:0", { rating: "up", note: "" }],
      ["chat:5:2", { rating: "wrong", note: "costs 4" }],
      ["review:m1", { rating: "down", note: "" }],
    ]);
    const asked = respond(200, { votes: [] });
    await fetchVotes("https://api.test", { matchId: "a/b" }, asked.fetchImpl);
    expect(asked.calls[0]!.url).toBe("https://api.test/analyst/feedback?match_id=a%2Fb");
  });

  it("start unselected when they can't be read (#679)", async () => {
    expect((await fetchVotes("", { threadId: 1 }, respond(403).fetchImpl)).size).toBe(0);
    expect((await fetchVotes("", { threadId: 1 }, (async () => { throw new Error("x"); }) as unknown as typeof fetch)).size).toBe(0);
  });
});

describe("the note form", () => {
  it("opens with the earlier note and caps typing at the limit (#679)", () => {
    const open = formReducer(CLOSED_FORM, { type: "open", note: "earlier" });
    expect(open).toMatchObject({ open: true, note: "earlier", sending: false });
    expect(formReducer(open, { type: "note", note: "y".repeat(NOTE_MAX + 5) }).note).toHaveLength(NOTE_MAX);
  });

  it("can't be closed or typed in while a note is being sent, and keeps the note when sending fails (#679)", () => {
    const sending = formReducer(formReducer(CLOSED_FORM, { type: "open", note: "keep me" }), { type: "sending" });
    expect(formReducer(sending, { type: "close" })).toBe(sending);
    expect(formReducer(sending, { type: "note", note: "other" })).toBe(sending);
    const failed = formReducer(sending, { type: "failed", error: FEEDBACK_ERROR });
    expect(failed).toMatchObject({ open: true, note: "keep me", sending: false, error: FEEDBACK_ERROR });
    expect(formReducer(failed, { type: "sent" })).toEqual(CLOSED_FORM);
  });

  it("says Thanks once a vote is saved, the error before anything else, and nothing before a vote (#679)", () => {
    expect(statusText(undefined, null, false)).toBe("");
    expect(statusText({ rating: "up", note: "" }, null, false)).toBe("Thanks");
    expect(statusText({ rating: "wrong", note: "x" }, null, false)).toBe("Thanks");
    expect(statusText({ rating: "up", note: "" }, null, true)).toBe("Sending…");
    expect(statusText({ rating: "up", note: "" }, FEEDBACK_ERROR, true)).toBe(FEEDBACK_ERROR);
  });
});
