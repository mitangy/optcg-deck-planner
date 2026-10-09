import { describe, expect, it } from "vitest";
import { answerTopup, decideAccess, listAccessRequests, requestAccess, setFreeSpots, sortRequests, type AccessRequest } from "./access";
import { fetchChatSession } from "./session";

type Call = { url: string; init: RequestInit };
function reply(body: unknown, status = 200) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return Response.json(body, { status });
  }) as typeof fetch;
  return { impl, calls };
}

const ENABLED = { enabled: true, token: "t", expires_at: "2026-10-07T00:00:00Z", chat_url: "https://lp.test/" };

describe("asking for Log Pose: session (#393)", () => {
  it("reads where a disabled player's request stands and ignores values it doesn't know (#393)", async () => {
    for (const access of ["none", "pending", "denied"] as const) {
      expect(await fetchChatSession("/api", reply({ enabled: false, access }).impl)).toEqual({ enabled: false, access });
    }
    expect(await fetchChatSession("/api", reply({ enabled: false, access: "approved" }).impl)).toEqual({ enabled: false });
    expect(await fetchChatSession("/api", reply({ enabled: false, access: null }).impl)).toEqual({ enabled: false });
  });

  it("reads the free spots a player who can ask is offered (#446)", async () => {
    const body = { enabled: false, access: "none", free_spots: 50, spots_left: 0, free_credit_usd: 5 };
    expect(await fetchChatSession("/api", reply(body).impl)).toEqual({ enabled: false, access: "none", freeSpots: 50, spotsLeft: 0, freeCreditUsd: 5 });
    expect(await fetchChatSession("/api", reply({ ...body, free_spots: -3, spots_left: "x" }).impl)).toEqual({ enabled: false, access: "none", freeCreditUsd: 5 });
  });

  it("reads owner and the waiting count only for owners (#393)", async () => {
    expect(await fetchChatSession("/api", reply({ ...ENABLED, owner: true, pending_requests: 3 }).impl)).toMatchObject({
      enabled: true,
      owner: true,
      pendingRequests: 3,
    });
    const player = await fetchChatSession("/api", reply({ ...ENABLED, owner: false, pending_requests: 3 }).impl);
    expect(player).toMatchObject({ enabled: true });
    expect(player).not.toHaveProperty("owner");
    expect(player).not.toHaveProperty("pendingRequests");
  });
});

const r = (userId: number, status: AccessRequest["status"]): AccessRequest => ({
  userId, name: "", note: "", status, createdAt: null, decidedAt: null, autoApproved: false, creditUsd: null, creditSpentUsd: 0, topupRequestedAt: null,
});

describe("asking for Log Pose: calls (#393)", () => {
  it("sends the trimmed note with the cookie and resolves to pending (#393)", async () => {
    const f = reply({ access: "pending" }, 201);
    expect(await requestAccess("https://api.test", "  deck help  ", f.impl)).toBe("pending");
    const { url, init } = f.calls[0]!;
    expect(url).toBe("https://api.test/analyst/access/request");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ note: "deck help" });
  });

  it("rejects with the server's reason, such as the wait before asking again (#393)", async () => {
    const f = reply({ detail: "you can ask again tomorrow" }, 429);
    await expect(requestAccess("/api", "", f.impl)).rejects.toThrow("you can ask again tomorrow");
    await expect(requestAccess("/api", "", (async () => new Response("<html>", { status: 502 })) as typeof fetch)).rejects.toThrow(/Try again/);
  });

  it("lists requests, dropping rows it can't read (#393)", async () => {
    const f = reply({
      requests: [
        { user_id: 7, name: "Nami", note: "hi", status: "pending", created_at: "2026-10-06T10:00:00Z", decided_at: null },
        { user_id: 8, status: "weird" },
      ],
    });
    expect((await listAccessRequests("/api", f.impl)).requests).toEqual([
      { userId: 7, name: "Nami", note: "hi", status: "pending", createdAt: "2026-10-06T10:00:00Z", decidedAt: null, autoApproved: false, creditUsd: null, creditSpentUsd: 0, topupRequestedAt: null },
    ]);
    expect(f.calls[0]!.init.credentials).toBe("include");
  });

  it("posts the decision to that player's request (#393)", async () => {
    const f = reply({ user_id: 7, name: "Nami", note: "", status: "denied", created_at: null, decided_at: "2026-10-07T00:00:00Z" });
    const row = await decideAccess("https://api.test", 7, "denied", f.impl);
    expect(f.calls[0]!.url).toBe("https://api.test/analyst/access/requests/7");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ status: "denied" });
    expect(row).toMatchObject({ userId: 7, status: "denied" });
  });

  it("keeps pending first, then approved, then denied, newest first within each (#393)", () => {
    expect(sortRequests([r(1, "denied"), r(2, "approved"), r(3, "pending"), r(4, "approved"), r(5, "pending")]).map((x) => x.userId)).toEqual([3, 5, 2, 4, 1]);
  });

  it("puts players asking for more credit before the waitlist (#446)", () => {
    const asking = { ...r(2, "approved"), topupRequestedAt: "2026-10-09T10:00:00Z" };
    expect(sortRequests([r(1, "pending"), asking, r(3, "denied")]).map((x) => x.userId)).toEqual([2, 1, 3]);
  });

  it("reads whether a request got a free spot at once or joined the waitlist (#446)", async () => {
    expect(await requestAccess("/api", "", reply({ access: "approved" }, 201).impl)).toBe("approved");
    expect(await requestAccess("/api", "", reply({ access: "pending" }, 201).impl)).toBe("pending");
  });

  it("lists the free spots, the credit each player used and who asked for more (#446)", async () => {
    const f = reply({
      requests: [
        { user_id: 7, name: "Nami", note: "", status: "approved", auto_approved: true, credit_usd: 5, credit_spent_usd: 5, topup_requested_at: "2026-10-09T10:00:00Z", created_at: null, decided_at: null },
      ],
      free_spots: 50,
      spots_used: 12,
    });
    const list = await listAccessRequests("/api", f.impl);
    expect(list).toMatchObject({ freeSpots: 50, spotsUsed: 12 });
    expect(list.requests[0]).toMatchObject({ autoApproved: true, creditUsd: 5, creditSpentUsd: 5, topupRequestedAt: "2026-10-09T10:00:00Z" });
  });

  it("saves the free spots and answers a top-up on that player (#446)", async () => {
    const put = reply({ free_spots: 20, spots_used: 3 });
    expect(await setFreeSpots("https://api.test", 20, put.impl)).toEqual({ freeSpots: 20, spotsUsed: 3 });
    expect(put.calls[0]).toMatchObject({ url: "https://api.test/analyst/access/free-spots", init: { method: "PUT" } });
    expect(JSON.parse(String(put.calls[0]!.init.body))).toEqual({ free_spots: 20 });
    const post = reply({ user_id: 7, name: "Nami", note: "", status: "approved", credit_usd: 10, credit_spent_usd: 5, topup_requested_at: null });
    const row = await answerTopup("https://api.test", 7, "add", post.impl);
    expect(post.calls[0]!.url).toBe("https://api.test/analyst/access/requests/7/topup");
    expect(JSON.parse(String(post.calls[0]!.init.body))).toEqual({ action: "add" });
    expect(row).toMatchObject({ creditUsd: 10, topupRequestedAt: null });
  });
});
