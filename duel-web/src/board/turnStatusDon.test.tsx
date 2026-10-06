import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerView } from "../net/protocol";
import { TurnStatusPanel } from "./TurnStatusPanel";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const card = (id: string, attachedDonCount?: number) => ({ id, defId: "OP01-006", power: 4000, printedPower: 4000, statusLabels: [], attachedDonCount });

function donCounts(html: string): string[] {
  return [...html.matchAll(/<dt>DON!!<\/dt><dd>([^<]*(?:<!-- -->[^<]*)*)<\/dd>/g)].map((m) => m[1].replace(/<!-- -->/g, ""));
}

describe("turn status DON!! counters", () => {
  it("counts attached DON!! in both players' totals (#345)", () => {
    const base = { stage: null, deckCount: 30, trash: [], lifeCount: 5, donDeckCount: 0 };
    const view = {
      seat: 0,
      activeSeat: 0,
      phase: "main",
      turnNumber: 3,
      donTotal: 10,
      winner: null,
      legalIntents: [],
      you: { ...base, leader: card("y-l", 1), characters: [card("y-c", 1)], hand: [], costArea: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, rested: false })), activeDonCount: 8 },
      opponent: { ...base, leader: card("o-l", 2), characters: [card("o-c")], handCount: 5, costAreaCount: 7, activeDonCount: 7 },
    } as unknown as PlayerView;
    const html = renderToStaticMarkup(
      <TurnStatusPanel view={view} boardSeat={0} firstSeat={0} players={null} spectating={false} turnClock={null} matchClock={null} />,
    );
    expect(donCounts(html)).toEqual(["7/9", "8/10"]);
  });
});
