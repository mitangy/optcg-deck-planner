import { describe, expect, it } from "vitest";
import { evalPlanner, type StatsFixtures, type TournamentFixtures } from "./planner";

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

  it("answers tournament stats from the fixtures by leader and opponent, and with no decks for a leader it has none for (#414)", async () => {
    const tournaments: TournamentFixtures = {
      synthetic: true,
      responses: { "": { total_decks: 48, leaders: [{ leader: "OP13-004" }] }, "leader=OP13-004": { leader: "OP13-004", meta: { decks: 9 } }, "leader=OP13-004&opponent=OP15-058": { leader: "OP13-004", opponent: "OP15-058", games: 12 } },
    };
    const { api } = evalPlanner({ mode: "fake", stats, tournaments });
    const get = async (q: string) => (await api.fetchImpl!(`https://planner.eval/analyst/tournaments/stats${q}`, {})).json();
    expect(await get("?days=14")).toMatchObject({ total_decks: 48, days: 14, source: "Limitless TCG tournaments" });
    expect(await get("?leader=OP13-004")).toMatchObject({ meta: { decks: 9 } });
    expect(await get("?leader=OP13-004&opponent=OP15-058")).toMatchObject({ games: 12 });
    expect(await get("?leader=OP16-001")).toMatchObject({ leader: "OP16-001", meta: { decks: 0 }, top_placings: [], too_few_decks: true });
    expect(await get("?leader=OP16-001&opponent=OP17-058")).toMatchObject({ games: 0, too_few_games: true, win_rate: null });
  });
});
