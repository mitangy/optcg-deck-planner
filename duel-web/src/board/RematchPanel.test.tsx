import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RematchDeckOption } from "../decks/rematchDecks";
import type { RematchState } from "../net/protocol";
import { RematchPanel, decksFromPicks } from "./RematchPanel";

const zoro: RematchDeckOption = { id: "zoro", name: "Zoro Aggro", leaderName: "Roronoa Zoro", cards: 50, wire: { leaderId: "OP01-001", deck: ["A"] } };
const luffy: RematchDeckOption = { id: "luffy", name: "Luffy Mid", leaderName: "Monkey.D.Luffy", cards: 48, wire: { leaderId: "ST01-001", deck: ["B"] } };
const options = [zoro, luffy];

const state = (over: Partial<RematchState> = {}): RematchState => ({
  available: true,
  requested: [false, false],
  newDeck: [false, false],
  declinedBy: null,
  chooser: null,
  ...over,
});

const html = (s: RematchState, mySeat: 0 | 1 = 0, autoAccept = false) =>
  renderToStaticMarkup(
    <RematchPanel state={s} mySeat={mySeat} players={null} autoAccept={autoAccept} deckOptions={options} onAction={() => {}} />,
  );

describe("rematch deck pick", () => {
  it("asks for a rematch with the picked deck at the player's own seat (#479)", () => {
    expect(decksFromPicks(options, ["", "luffy"])).toEqual([undefined, luffy.wire]);
  });

  it("keeps the same deck by default: no deck is sent (#479)", () => {
    expect(decksFromPicks(options, ["", ""])).toBeUndefined();
    expect(decksFromPicks(options, ["gone", ""])).toBeUndefined();
  });

  it("practice sends each seat's own pick (#479)", () => {
    expect(decksFromPicks(options, ["zoro", "luffy"])).toEqual([zoro.wire, luffy.wire]);
  });

  it("offers Keep same deck first, then each saved deck, before asking (#479)", () => {
    const h = html(state());
    const labels = [...h.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Keep same deck", "Zoro Aggro — Roronoa Zoro (50)", "Luffy Mid — Monkey.D.Luffy (48)"]);
    expect(h).toContain("Deck for the rematch");
  });

  it("practice shows one picker per seat (#479)", () => {
    expect((html(state(), 0, true).match(/<select/g) ?? []).length).toBe(2);
    expect((html(state(), 0, false).match(/<select/g) ?? []).length).toBe(1);
  });

  it("tells you when the opponent is bringing a different deck, not when you are (#479)", () => {
    const s = state({ requested: [false, true], newDeck: [false, true] });
    expect(html(s, 0)).toContain("is bringing a different deck.");
    expect(html(s, 1)).not.toContain("is bringing a different deck.");
  });
});
