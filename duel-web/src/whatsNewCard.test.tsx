import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router-dom";
import { lastSeenKey, notesFor, WhatsNewCard } from "@optcg/patch-notes";

function renderCard(stored: string | null): string {
  const data: Record<string, string> = stored === null ? {} : { [lastSeenKey("duel")]: stored };
  vi.stubGlobal("localStorage", { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <WhatsNewCard app="duel" Link={Link} />
    </MemoryRouter>,
  );
  renderCard.stored = data[lastSeenKey("duel")];
  return html;
}
renderCard.stored = undefined as string | undefined;

afterEach(() => vi.unstubAllGlobals());

describe("What's new card (#450)", () => {
  it("announces the three newest notes since the last seen day and counts the rest (#450)", () => {
    const duel = notesFor("duel");
    const oldest = duel[duel.length - 1].date;
    const html = renderCard(oldest);
    expect(html).toContain("What’s new");
    for (const n of duel.slice(0, 3)) expect(html).toContain(n.title);
    expect(html).not.toContain(duel[3].title);
    const unseen = duel.filter((n) => n.date > oldest).length;
    expect(html).toContain(`+${unseen - 3} more`);
    expect(html).toContain('href="/whats-new"');
    expect(html).toContain("Got it");
  });

  it("stays hidden when the newest day was already seen (#450)", () => {
    expect(renderCard(notesFor("duel")[0].date)).toBe("");
  });

  it("stays hidden on a first run and records the newest day for next time (#450)", () => {
    expect(renderCard(null)).toBe("");
    expect(renderCard.stored).toBe(notesFor("duel")[0].date);
  });
});
