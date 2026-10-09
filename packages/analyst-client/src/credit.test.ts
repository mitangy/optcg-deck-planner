import { describe, expect, it } from "vitest";
import { applyDone, creditLeft, fetchCredit, limitText, lowCreditText, meterFill, meterText, parseCredit, questionsLeft, refillDay, requestTopup, withRefusal, type Credit } from "./credit";

const credit = (over: Partial<Credit> = {}): Credit => ({
  creditUsd: 5,
  spentUsd: 1.6,
  resetsAt: "2026-11-01T00:00:00+00:00",
  refusal: null,
  avgChatCostUsd: null,
  topupRequested: false,
  ...over,
});

describe("credit meter (#446)", () => {
  it("says how much is left of this month's credit and how full the bar is", () => {
    expect(meterText(credit())).toBe("$3.40 of $5.00 left this month");
    expect(meterFill(credit())).toBeCloseTo(0.68);
    // Overspent by one call never goes negative.
    expect(meterText(credit({ spentUsd: 5.12 }))).toBe("$0.00 of $5.00 left this month");
    expect(meterFill(credit({ spentUsd: 5.12 }))).toBe(0);
  });

  it("shows no meter for an owner, who has no credit to run out of", () => {
    expect(meterText(credit({ creditUsd: null }))).toBeNull();
    expect(creditLeft(credit({ creditUsd: null }))).toBeNull();
  });

  it("reads the credit endpoint and nothing else", () => {
    expect(parseCredit({ credit_usd: 5, credit_spent_usd: 2, credit_resets_at: "2026-11-01T00:00:00+00:00", refusal: "daily", avg_chat_cost_usd: 0.1, topup_requested: true })).toEqual({
      creditUsd: 5, spentUsd: 2, resetsAt: "2026-11-01T00:00:00+00:00", refusal: "daily", avgChatCostUsd: 0.1, topupRequested: true,
    });
    expect(parseCredit({ credit_usd: null, refusal: "nope" })).toMatchObject({ creditUsd: null, refusal: null });
    expect(parseCredit(null)).toBeNull();
  });

  it("loads the credit with the cookie and treats a failure as no credit info", async () => {
    const calls: string[] = [];
    const ok = (async (url: string, init: RequestInit) => (calls.push(`${url} ${init.credentials}`), Response.json({ credit_usd: 5, credit_spent_usd: 1 }))) as unknown as typeof fetch;
    expect(await fetchCredit("https://api.test", ok)).toMatchObject({ creditUsd: 5, spentUsd: 1 });
    expect(calls).toEqual(["https://api.test/analyst/chat/credit include"]);
    expect(await fetchCredit("/api", (async () => new Response("", { status: 403 })) as typeof fetch)).toBeNull();
    expect(await fetchCredit("/api", (async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
  });
});

describe("low credit line (#446)", () => {
  it("appears once under a dollar is left", () => {
    expect(lowCreditText(credit({ spentUsd: 4.1 }))).toBe("About 12 questions left");
  });

  it("is quiet while a dollar or more is left, once out and for owners", () => {
    expect(lowCreditText(credit({ spentUsd: 4.0 }))).toBeNull();
    expect(lowCreditText(credit({ spentUsd: 5, refusal: "credit" }))).toBeNull();
    expect(lowCreditText(credit({ creditUsd: null }))).toBeNull();
  });

  it("uses the player's average, falling back to 7 cents", () => {
    expect(questionsLeft(credit({ spentUsd: 4.3, avgChatCostUsd: 0.1 }))).toBe(7);
    expect(questionsLeft(credit({ spentUsd: 4.3, avgChatCostUsd: null }))).toBe(10);
    expect(lowCreditText(credit({ spentUsd: 4.3, avgChatCostUsd: 0.1 }))).toBe("About 7 questions left");
  });

  it("never says zero while some credit is left, and says question for one", () => {
    expect(questionsLeft(credit({ spentUsd: 4.99, avgChatCostUsd: 0.2 }))).toBe(1);
    expect(lowCreditText(credit({ spentUsd: 4.99, avgChatCostUsd: 0.2 }))).toBe("About 1 question left");
  });
});

describe("limit notices (#446)", () => {
  it("out of credit names the amount and the day it refills", () => {
    expect(limitText(credit({ refusal: "credit", spentUsd: 5 }))).toBe(
      "You've used this month's free $5.00 of Log Pose. It refills on November 1. Your threads, saved reviews and briefs stay here to read.",
    );
    expect(refillDay("2027-01-01T00:00:00+00:00")).toBe("January 1");
    expect(refillDay(null)).toBe("the 1st");
  });

  it("the daily cap says when it is back and how much credit is left", () => {
    expect(limitText(credit({ refusal: "daily" }))).toBe("You've hit today's Log Pose limit. It's back at midnight UTC, with $3.40 of credit left.");
    expect(limitText(credit({ refusal: "daily", creditUsd: null }))).toBe("You've hit today's Log Pose limit. It's back at midnight UTC.");
  });

  it("the monthly cap is not a player running out", () => {
    expect(limitText(credit({ refusal: "monthly" }))).toBe("Log Pose is resting until the 1st.");
    expect(limitText(credit())).toBeNull();
  });
});

describe("keeping the credit current (#446)", () => {
  it("takes the new figures from an answer's done event and leaves the rest", () => {
    const next = applyDone(credit({ avgChatCostUsd: 0.1 }), { credit_usd: 5, credit_spent_usd: 3.2, refusal: null });
    expect(next).toMatchObject({ creditUsd: 5, spentUsd: 3.2, refusal: null, avgChatCostUsd: 0.1 });
    expect(applyDone(credit(), { cost_usd: 0.1 })).toEqual(credit());
    expect(applyDone(null, { credit_spent_usd: 1 })).toBeNull();
  });

  it("shows a refusal an answer came back with even when the credit never loaded", () => {
    expect(withRefusal(null, "credit")).toMatchObject({ refusal: "credit", creditUsd: null });
    expect(withRefusal(credit(), "daily")).toMatchObject({ refusal: "daily", creditUsd: 5, spentUsd: 1.6 });
  });

  it("asks for more with the cookie and reports a failure", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (status: number) => (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(null, { status }))) as unknown as typeof fetch;
    await requestTopup("https://api.test", impl(204));
    expect(calls[0]).toMatchObject({ url: "https://api.test/analyst/access/topup", init: { method: "POST", credentials: "include" } });
    await expect(requestTopup("/api", impl(409))).rejects.toThrow(/Try again/);
  });
});
