import { describe, expect, it } from "vitest";
import { evalPlanner, type StatsFixtures } from "./planner";

const stats: StatsFixtures = { synthetic: true, responses: { "leader=OP13-004": { leader: "OP13-004", overall: { games: 9 } } } };

describe("eval planner", () => {
  it("keeps chat usage local but forwards stats reads, with the service secret, in live mode (#403)", async () => {
    const forwarded: { url: string; headers: Record<string, string> }[] = [];
    const forward = (async (url: string, init: RequestInit) => {
      forwarded.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ live: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const { api, captured } = evalPlanner({ mode: "live", stats, liveUrl: "https://planner.example/api", secret: "s3", forward });
    const usage = { kind: "chat", input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 1 };
    await api.fetchImpl!("https://planner.eval/analyst/chat/usage", { method: "POST", body: JSON.stringify(usage) });
    const res = await api.fetchImpl!("https://planner.eval/analyst/stats/matchups?leader=OP13-004", {});
    expect(await res.json()).toEqual({ live: true });
    expect(captured.usage).toEqual([{ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }]);
    expect(forwarded).toEqual([{ url: "https://planner.example/api/analyst/stats/matchups?leader=OP13-004", headers: { "X-Analyst-Service": "s3" } }]);
  });

  it("answers stats from the fixtures when fake, and with no games for a matchup it has no fixture for (#403)", async () => {
    const { api } = evalPlanner({ mode: "fake", stats });
    const known = await (await api.fetchImpl!("https://planner.eval/analyst/stats/matchups?leader=OP13-004&days=30", {})).json();
    expect(known).toMatchObject({ leader: "OP13-004", overall: { games: 9 }, days: 30 });
    const unknown = await (await api.fetchImpl!("https://planner.eval/analyst/stats/matchups?leader=OP16-001&opponent=OP17-058", {})).json();
    expect(unknown).toMatchObject({ leader: "OP16-001", opponent: "OP17-058", games: 0, too_few_games: true, win_rate: null });
  });
});
