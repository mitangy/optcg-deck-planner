import { describe, expect, it } from "vitest";
import { fetchUsageSummary, parseUsage } from "./usage";

describe("usage summary (#446)", () => {
  it("reads the totals, each player and each kind and model, dropping rows it can't read", () => {
    const u = parseUsage({
      today_usd: 0.5, month_usd: 3, total_usd: 12.5,
      players: [
        { user_id: 1, name: "Nami", spent_usd: 4.2, credit_usd: 5, credit_spent_usd: 2, threads: 3, questions: 12, refused: 1, last_used: "2026-10-09T10:00:00Z" },
        { name: "no id" },
      ],
      groups: [{ kind: "chat", model: "claude-sonnet-5-5", requests: 40, cost_usd: 2.8 }],
    });
    expect(u).toMatchObject({ todayUsd: 0.5, monthUsd: 3, totalUsd: 12.5 });
    expect(u.players).toEqual([{ userId: 1, name: "Nami", spentUsd: 4.2, creditUsd: 5, creditSpentUsd: 2, threads: 3, questions: 12, refused: 1, lastUsed: "2026-10-09T10:00:00Z" }]);
    expect(u.groups).toEqual([{ kind: "chat", model: "claude-sonnet-5-5", requests: 40, costUsd: 2.8 }]);
  });

  it("asks the owner endpoint with the cookie and fails loudly when refused", async () => {
    const calls: string[] = [];
    const ok = (async (url: string, init: RequestInit) => (calls.push(`${url} ${init.credentials}`), Response.json({ total_usd: 1 }))) as unknown as typeof fetch;
    expect((await fetchUsageSummary("https://api.test", ok)).totalUsd).toBe(1);
    expect(calls).toEqual(["https://api.test/analyst/usage/summary include"]);
    await expect(fetchUsageSummary("/api", (async () => new Response("", { status: 403 })) as typeof fetch)).rejects.toThrow("Could not load usage.");
  });
});
