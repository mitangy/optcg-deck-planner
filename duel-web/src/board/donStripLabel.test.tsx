import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DonStrip } from "./DonStrip";
import { SideField } from "./SideField";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const nums = (html: string) => html.match(/don-strip-nums">([^<]*)</)?.[1];
const chips = (html: string) => (html.match(/don-chip-btn|class="don-chip/g) ?? []).length;

const leader = { id: "y-l", defId: "OP16-001", power: 5000, printedPower: 5000, statusLabels: [], attachedDonCount: 1 };
const character = { id: "y-c", defId: "OP01-006", power: 4000, printedPower: 4000, statusLabels: [], attachedDonCount: 1 };

describe("DON!! counter label", () => {
  it("shows labelTotal as the denominator without changing the chip count (#345)", () => {
    const withLabel = renderToStaticMarkup(<DonStrip side="opp" activeCount={8} totalCount={8} labelTotal={10} />);
    const without = renderToStaticMarkup(<DonStrip side="opp" activeCount={8} totalCount={8} />);
    expect(nums(withLabel)).toBe("8/10");
    expect(nums(without)).toBe("8/8");
    expect(chips(withLabel)).toBe(chips(without));
  });

  it("shows 8/10 on your side when 2 of 10 DON!! are attached (#345)", () => {
    const costArea = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, rested: false }));
    const html = renderToStaticMarkup(
      <SideField
        side="you"
        data={{ leader, characters: [character], stage: null, deckCount: 30, trash: [], lifeCount: 3, donDeckCount: 0, costArea, activeDonCount: 8 }}
      />,
    );
    expect(nums(html)).toBe("8/10");
  });
});

describe("DON!! piles in the cost area (#381)", () => {
  const tokens = Array.from({ length: 6 }, (_, i) => ({ id: `d${i + 1}`, rested: i >= 3 }));
  const piles = (html: string) => (html.match(/class="don-pile"/g) ?? []).length;

  it("renders one .don-pile group per pile on your side with the gaps in the rail style (#381)", () => {
    const html = renderToStaticMarkup(
      <DonStrip side="you" tokens={tokens} donPiles={{ d2: 1, d5: 1, d6: 2 }} onDonPileMove={() => {}} />,
    );
    expect(piles(html)).toBe(3);
    expect(html).toContain("--don-gaps:2");
    expect(html).toContain("--don-piles:3");
    expect(html).toContain("right-click (long-press on phones) to move to another pile");
  });

  it("lays out a single pile as a plain rail with no wrapper (#381)", () => {
    const html = renderToStaticMarkup(<DonStrip side="you" tokens={tokens} donPiles={{}} onDonPileMove={() => {}} />);
    expect(piles(html)).toBe(0);
    expect(chips(html)).toBeGreaterThan(0);
  });

  it("opponent DON!! never form piles (#381)", () => {
    const html = renderToStaticMarkup(<DonStrip side="opp" activeCount={3} totalCount={6} donPiles={{ d2: 1 }} onDonPileMove={() => {}} />);
    expect(piles(html)).toBe(0);
    expect(html).not.toContain("right-click");
  });
});
