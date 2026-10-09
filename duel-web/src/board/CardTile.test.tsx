import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardTile } from "./CardTile";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

describe("card tile inspect", () => {
  it("board and hand cards render no inspect chip, inspecting is by gesture or the I key (#449)", () => {
    const board = renderToStaticMarkup(<CardTile defId="ST01-001" inspectGestures />);
    const hand = renderToStaticMarkup(<CardTile defId="ST01-001" onClick={() => {}} dragEnabled />);
    for (const html of [board, hand]) {
      expect(html).toContain("card-tile");
      expect(html).not.toContain("card-inspect-chip");
      expect(html).not.toContain("Inspect ");
    }
  });
});
