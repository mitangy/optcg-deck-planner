import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TopBountiesCard } from "./TopBounties";

const entries = [1612, 1544, 1531].map((rating, i) => ({ user_id: 100 + i, name: `Player ${i + 1}`, username: `Rival${i + 1}`, rating, games_played: 30 }));

function render(list: typeof entries): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopBountiesCard entries={list} me={null} />
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

  it("stays hidden when there are no ranked players (#460)", () => {
    expect(render([])).toBe("");
  });
});
