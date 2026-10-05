import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SideField } from "./SideField";
import { lifePileFaces } from "./ZonePile";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const leader = { id: "y-l", defId: "OP16-001", power: 5000, printedPower: 5000, statusLabels: [] };

function lifeFaces(html: string): Array<string | null> {
  const stack = html.match(/zone-pile-life[\s\S]*?<\/div>/)?.[0] ?? "";
  return [...stack.matchAll(/<span class="zone-pile-face( is-face-up)?"(?: data-def-id="([^"]+)")?/g)].map((m) => m[2] ?? null);
}

describe("face-up Life on the mat", () => {
  it("draws the top Life card face up at the front of the fan (#326)", () => {
    expect(lifePileFaces(3, [{ index: 0, defId: "OP16-108" }])).toEqual([null, null, "OP16-108"]);
    expect(lifePileFaces(4, [{ index: 2, defId: "OP09-082" }])).toEqual([null, "OP09-082", null, null]);
  });

  it("stretches a capped fan so a deep face-up Life card still shows (#326)", () => {
    expect(lifePileFaces(7, [{ index: 6, defId: "OP09-082" }])).toEqual(["OP09-082", null, null, null, null, null, null]);
  });

  it("shows your face-up Life card's art in your Life pile (#326)", () => {
    const html = renderToStaticMarkup(
      <SideField
        side="you"
        data={{ leader, characters: [], stage: null, deckCount: 30, trash: [], lifeCount: 3, faceUpLife: [{ index: 0, defId: "OP16-108" }], donDeckCount: 10, costArea: [], activeDonCount: 0 }}
      />,
    );
    expect(lifeFaces(html)).toEqual([null, null, "OP16-108"]);
  });
});
