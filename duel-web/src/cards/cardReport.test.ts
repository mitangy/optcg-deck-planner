import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuelClient } from "../net/duelClient";
import { noteMatchGameToken, noteMatchRoom } from "../matchContext";
import { submitCardReport } from "./cardReport";

function okFetch() {
  return vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;
}

function sent(fetchImpl: ReturnType<typeof vi.fn>) {
  const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return {
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, string>,
  };
}

describe("submitCardReport", () => {
  beforeEach(() => noteMatchRoom(undefined));

  it("refuses a padded description that is too short without calling the API", async () => {
    const fetchImpl = okFetch();
    await expect(submitCardReport("OP01-060", "   broken        ", fetchImpl)).rejects.toThrow(
      /at least 10 characters/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("identifies the reporter with the match game token", async () => {
    noteMatchGameToken("guest-token.sig");
    const fetchImpl = okFetch();
    await submitCardReport("OP01-060", "Search never offers a choice.", fetchImpl);
    expect(sent(fetchImpl).headers.Authorization).toBe("Bearer guest-token.sig");
  });

  it("stops tagging reports with a room after leaving the match", async () => {
    noteMatchRoom("room-123");
    await new DuelClient().disconnect();
    const fetchImpl = okFetch();
    await submitCardReport("OP01-060", "Search never offers a choice.", fetchImpl);
    expect(sent(fetchImpl).body.room_id).toBe("");
  });
});
