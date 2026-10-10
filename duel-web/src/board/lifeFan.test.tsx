import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings } from "../settings";
import { SideField } from "./SideField";
import { lifeFanForSide } from "./ZonePile";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const leader = { id: "y-l", defId: "OP16-001", power: 5000, printedPower: 5000, statusLabels: [] };
const data = { leader, characters: [], stage: null, deckCount: 30, trash: [], lifeCount: 3, donDeckCount: 10, costArea: [], activeDonCount: 0 };

function lifeStackClass(html: string): string {
  return html.match(/<div class="(zone-pile-stack[^"]*)"[^>]*><span class="zone-pile-face/)?.[1] ?? "";
}

describe("Life fan direction (#499)", () => {
  it("mirrors the opponent's fan across the midline and follows the setting on your side (#499)", () => {
    expect(lifeFanForSide("down", "you")).toBe("down");
    expect(lifeFanForSide("up", "you")).toBe("up");
    expect(lifeFanForSide("down", "opp")).toBe("up");
    expect(lifeFanForSide("up", "opp")).toBe("down");
  });

  it("fans your Life down and the opponent's up by default (#499)", () => {
    expect(lifeStackClass(renderToStaticMarkup(<SideField side="you" data={data} />))).not.toContain("is-fan-up");
    expect(lifeStackClass(renderToStaticMarkup(<SideField side="opp" data={data} />))).toContain("is-fan-up");
  });

  it("fans your Life up and the opponent's down with the Fans up setting (#499)", () => {
    expect(lifeStackClass(renderToStaticMarkup(<SideField side="you" lifeFan="up" data={data} />))).toContain("is-fan-up");
    expect(lifeStackClass(renderToStaticMarkup(<SideField side="opp" lifeFan="up" data={data} />))).not.toContain("is-fan-up");
  });
});

describe("lifeFan setting (#499)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a stored up and resets an unknown value to down (#499)", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ lifeFan: "up" }) });
    expect(loadSettings().lifeFan).toBe("up");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ lifeFan: "sideways" }) });
    expect(loadSettings().lifeFan).toBe("down");
  });
});
