import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardTile } from "./CardTile";
import { cardAriaLabel } from "./cardLabel";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

describe("card accessible name (#1343)", () => {
  it("names the card first, then its power, cost, attached DON!! and rested state (#1343)", () => {
    expect(cardAriaLabel({ name: "Karoo", power: 4000, cost: 1, rested: true, attachedDon: 2 })).toBe(
      "Karoo, power 4000, cost 1, 2 DON!! attached, rested",
    );
    expect(cardAriaLabel({ name: "Karoo" })).toBe("Karoo");
    expect(cardAriaLabel({ name: "Leader", power: 0, cost: 0 })).toBe("Leader, power 0, cost 0");
  });

  it("a tappable tile and a plain tile both carry the label (#1343)", () => {
    const tap = renderToStaticMarkup(<CardTile defId="ST01-001" power={6000} rested onClick={() => {}} />);
    const plain = renderToStaticMarkup(<CardTile defId="ST01-001" power={6000} rested />);
    for (const html of [tap, plain]) {
      expect(html).toMatch(/aria-label="[^"]*power 6000[^"]*rested"/);
    }
  });
});
