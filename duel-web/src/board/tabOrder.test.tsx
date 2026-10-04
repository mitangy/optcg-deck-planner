import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardTile } from "./CardTile";
import { StatusRow } from "./StatusIcon";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

describe("tab order", () => {
  it("status icons, chips and the +N badge are not Tab stops (#282)", () => {
    const html = renderToStaticMarkup(<StatusRow labels={["Negated", "Rush", "Banish"]} stackKey="k" />);
    // Every badge is focusable by tap (the touch tooltip) but skipped by Tab.
    const badges = html.match(/<span[^>]*status-(?:icon|chip)[^>]*>/g) ?? [];
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) {
      expect(b).toContain('tabindex="-1"');
      expect(b).not.toContain('tabindex="0"');
    }
  });

  it("the inspect chip on a card is not a Tab stop (#282)", () => {
    const html = renderToStaticMarkup(<CardTile defId="ST01-001" inspectGestures />);
    const chip = html.match(/<span[^>]*card-inspect-chip[^>]*>/)?.[0];
    expect(chip).toBeTruthy();
    expect(chip).toContain('tabindex="-1"');
  });
});
