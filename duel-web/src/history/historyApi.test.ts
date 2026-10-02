import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAnalystLesson, fetchAnalystSharing, reviewAnalystLesson, setAnalystSharing } from "./historyApi";

type Call = { path: string; method: string; body?: string };

function stubFetch(answer: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ path: new URL(url).pathname, method: init.method ?? "GET", body: init.body as string | undefined });
    return new Response(status === 204 ? null : JSON.stringify(answer), { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Log Pose settings requests", () => {
  it("saves the stats opt-out (#246)", async () => {
    const calls = stubFetch({ share_matches: false });
    await expect(setAnalystSharing(false)).resolves.toBe(false);
    await expect(fetchAnalystSharing()).resolves.toBe(false);
    expect(calls).toEqual([
      { path: "/analyst/sharing", method: "PUT", body: JSON.stringify({ share_matches: false }) },
      { path: "/analyst/sharing", method: "GET", body: undefined },
    ]);
  });

  it("reviews and deletes one lesson by id (#246)", async () => {
    const calls = stubFetch({ id: 7, status: "approved" });
    await reviewAnalystLesson(7, "approved");
    expect(calls).toEqual([{ path: "/analyst/lessons/review/7", method: "PATCH", body: JSON.stringify({ status: "approved" }) }]);
    const deletes = stubFetch(null, 204);
    await expect(deleteAnalystLesson(9)).resolves.toBeUndefined();
    expect(deletes).toEqual([{ path: "/analyst/lessons/review/9", method: "DELETE", body: undefined }]);
  });
});
