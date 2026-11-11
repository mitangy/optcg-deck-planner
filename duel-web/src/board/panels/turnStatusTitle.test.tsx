import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlayerView } from "../../net/protocol";
import { TurnStatusPanel } from "./TurnStatusPanel";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

const card = (id: string) => ({ id, defId: "OP01-006", power: 4000, printedPower: 4000, statusLabels: [] });
const side = { stage: null, deckCount: 30, trash: [], lifeCount: 5, donDeckCount: 0, characters: [], activeDonCount: 0 };

function view(over: Partial<PlayerView>): PlayerView {
  return {
    seat: 0,
    activeSeat: 1,
    phase: "main",
    turnNumber: 3,
    donTotal: 10,
    winner: null,
    legalIntents: [],
    you: { ...side, leader: card("y-l"), hand: [], costArea: [] },
    opponent: { ...side, leader: card("o-l"), handCount: 5, costAreaCount: 0 },
    ...over,
  } as unknown as PlayerView;
}

const heading = (v: PlayerView, spectating: boolean) =>
  renderToStaticMarkup(
    <TurnStatusPanel view={v} boardSeat={0} firstSeat={0} players={null} spectating={spectating} turnClock={null} matchClock={null} />,
  ).match(/class="turn-banner-title">([^<]*)</)?.[1] ?? null;

describe("turn card heading", () => {
  it("a player on the opponent's turn gets no big heading, the button says it (#1247)", () => {
    expect(heading(view({ activeSeat: 1 }), false)).toBeNull();
    expect(heading(view({ activeSeat: 0 }), false)).toBeNull();
  });

  it("a spectator, who has no button, still gets the whose-turn heading (#1247)", () => {
    expect(heading(view({ activeSeat: 1 }), true)).toBe("Player 2&#x27;s turn");
  });

  it("a finished match still says Match over (#1247)", () => {
    expect(heading(view({ winner: 0 } as Partial<PlayerView>), false)).toBe("Match over");
  });
});
