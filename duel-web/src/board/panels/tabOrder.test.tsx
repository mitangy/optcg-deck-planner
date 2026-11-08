import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
});
