import { describe, expect, it, vi } from "vitest";
import { noteMatchGameToken } from "../matchContext";
import { submitReport } from "./reportApi";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 201 }));

describe("sending a report (#810)", () => {
  it("carries the game token so a guest in a match is identified, and posts the body as JSON (#810)", async () => {
    noteMatchGameToken("tok-123");
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => ok({ id: 7, duplicate: false }));
    const out = await submitReport({ reason: "toxic", source: "match", match_id: "r1", reported_seat: 1 }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ id: 7, duplicate: false });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toMatch(/\/duel\/reports$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    expect(JSON.parse(init!.body as string)).toEqual({ reason: "toxic", source: "match", match_id: "r1", reported_seat: 1 });
  });

  it("says plainly when the report limit is hit, and when the player cannot be found (#810)", async () => {
    const reply = (status: number) => (() => Promise.resolve(new Response("{}", { status }))) as unknown as typeof fetch;
    await expect(submitReport({ reason: "toxic", source: "match" }, reply(429))).rejects.toThrow(/try again later/);
    await expect(submitReport({ reason: "toxic", source: "match" }, reply(404))).rejects.toThrow(/Bots and guests/);
  });
});
