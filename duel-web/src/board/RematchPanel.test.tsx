// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

let root: Root | null = null;
let host: HTMLElement | null = null;
const onAction = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onAction.mockClear();
});

/** Mounts the panel and opens the first deck picker. */
function openPicker(mySeat: 0 | 1) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<RematchPanel state={state()} mySeat={mySeat} players={null} deckOptions={options} onAction={onAction} />));
  const button = () => host!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
  act(() => button().click());
  const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  return {
    button,
    rows,
    listbox: document.querySelector<HTMLElement>('[role="listbox"]')!,
    labels: () => rows().map((r) => r.textContent),
  };
}

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

  it("offers Keep same deck first, then each saved deck with its leader and size, before asking (#479, #772)", () => {
    const h = html(state());
    expect(h).toContain("Deck for the rematch");
    expect(h).toContain("Keep same deck");
    const { button, labels } = openPicker(0);
    expect(labels()).toEqual([
      "Keep same deck✓",
      "Zoro Aggro" + "Roronoa Zoro · 50 cards",
      "Luffy Mid" + "Monkey.D.Luffy · 48 cards",
    ]);
    const names = button().getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(names).toContain("Deck for the rematch");
  });

  it("picking a deck updates the trigger and sends that deck with the request (#479, #772)", () => {
    const { button, rows } = openPicker(0);
    expect(button().textContent).toContain("Keep same deck");
    act(() => rows()[2]!.click());
    expect(button().textContent).toContain("Luffy Mid");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    act(() => [...host!.querySelectorAll("button")].find((b) => b.textContent === "Ask for a rematch")!.click());
    expect(onAction).toHaveBeenCalledWith("request", [luffy.wire, undefined]);
  });

  it("practice shows one picker per seat (#479)", () => {
    expect((html(state(), 0, true).match(/aria-haspopup="listbox"/g) ?? []).length).toBe(2);
    expect((html(state(), 0, false).match(/aria-haspopup="listbox"/g) ?? []).length).toBe(1);
    expect(html(state(), 0, true)).not.toContain("<select");
  });

  it("tells you when the opponent is bringing a different deck, not when you are (#479)", () => {
    const s = state({ requested: [false, true], newDeck: [false, true] });
    expect(html(s, 0)).toContain("is bringing a different deck.");
    expect(html(s, 1)).not.toContain("is bringing a different deck.");
  });
});
