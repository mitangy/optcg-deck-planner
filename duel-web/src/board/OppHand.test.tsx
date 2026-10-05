import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OppHandCorner, OppHandFan, OppHandHint } from "./TurnStatusPanel";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

function countBadge(html: string): string | undefined {
  return html.match(/class="opp-hand-count"[^>]*>(\d+)</)?.[1];
}

describe("opponent hand count", () => {
  it("shows the full hand size beside the capped row of backs", () => {
    const html = renderToStaticMarkup(<OppHandHint count={11} cardBackUrl={null} />);
    expect(countBadge(html)).toBe("11");
    expect(html.match(/class="card-back"/g)).toHaveLength(8);
  });

  it("shows the full hand size beside the capped fan", () => {
    const html = renderToStaticMarkup(<OppHandFan count={13} cardBackUrl={null} />);
    expect(countBadge(html)).toBe("13");
  });

  it("shows the full hand size beside the capped top-right fan (#256)", () => {
    const html = renderToStaticMarkup(<OppHandCorner count={13} cardBackUrl={null} variant="mat" />);
    expect(countBadge(html)).toBe("13");
    expect(html.match(/opp-corner-card"/g)).toHaveLength(10);
  });
});

describe("spectator far hand (#250)", () => {
  const cards = [
    { id: "h1", defId: "OP01-016" },
    { id: "h2", defId: "OP01-013" },
  ];

  it("shows the far player's hand face up instead of backs in the narrow strip (#250)", () => {
    const html = renderToStaticMarkup(<OppHandHint count={2} cardBackUrl={null} cards={cards} />);
    expect(html.match(/opp-hand-face(?!s)/g)).toHaveLength(2);
    expect(html).not.toMatch(/class="card-back"/);
  });

  it("shows the far player's hand face up instead of backs in the rail fan (#250)", () => {
    const html = renderToStaticMarkup(<OppHandFan count={2} cardBackUrl={null} cards={cards} />);
    expect(html.match(/opp-fan-face/g)).toHaveLength(2);
    expect(html).not.toMatch(/card-back opp-fan-card/);
  });
});
