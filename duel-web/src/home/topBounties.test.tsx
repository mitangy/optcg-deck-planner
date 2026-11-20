import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TopBountiesCard } from "./TopBounties";

const entries = [1612, 1544, 1531].map((rating, i) => ({ user_id: 100 + i, name: `Player ${i + 1}`, username: `Rival${i + 1}`, rating, games_played: 30, rank: i + 1, provisional: false, wins: 0, losses: 0 }));

const mine = { user_id: 101, email: "r2@e2e.test", name: "Player 2", username: "Rival2", rating: 1544, games_played: 30, wins: 20, losses: 10, rank: 2 };

function render(list: typeof entries, me: typeof mine | null = null): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopBountiesCard entries={list} me={me} />
    </MemoryRouter>,
  );
}

describe("Top bounties card (#460)", () => {
  it("links its title and a See all link to the full leaderboard (#460)", () => {
    const html = render(entries);
    expect(html.match(/href="\/leaderboard"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="See full leaderboard"');
    expect(html).toContain("Rival1");
  });

  it("shows the server's rank so tied players share one (#1387)", () => {
    const tied = entries.map((e, i) => ({ ...e, rank: [1, 1, 3][i] }));
    const ranks = [...render(tied).matchAll(/bounty-rank">(\d+)</g)].map((m) => m[1]);
    expect(ranks).toEqual(["1", "1", "3"]);
  });

  it("stays hidden when there are no ranked players (#460)", () => {
    expect(render([])).toBe("");
  });

  it("labels your own row You, and no other row (#1391)", () => {
    const html = render(entries, mine);
    expect(html.match(/class="bounty-you"/g)).toHaveLength(1);
    expect(html).toMatch(/Rival2<\/span><span class="bounty-you">You/);
    expect(render(entries)).not.toContain("bounty-you");
  });
});
