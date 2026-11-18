// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RematchDeckOption } from "../../decks/rematchDecks";
import type { RematchState } from "../../net/protocol";
import { RematchPanel, decksFromPicks, rematchStage } from "./RematchPanel";

const zoro: RematchDeckOption = { id: "zoro", name: "Zoro Aggro", leaderId: "OP01-001", leaderName: "Roronoa Zoro", cards: 50, wire: { leaderId: "OP01-001", deck: ["A"] } };
const luffy: RematchDeckOption = { id: "luffy", name: "Luffy Mid", leaderId: "ST01-001", leaderName: "Monkey.D.Luffy", cards: 48, wire: { leaderId: "ST01-001", deck: ["B"] } };
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

function mount(node: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

const changeDeck = () => [...host!.querySelectorAll("button")].find((b) => /^Change decks?$/.test(b.textContent ?? ""));

function openPicker(mySeat: 0 | 1) {
  mount(<RematchPanel state={state()} mySeat={mySeat} players={null} deckOptions={options} onAction={onAction} />);
  act(() => changeDeck()!.click());
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
    const { button, labels } = openPicker(0);
    expect(labels()).toEqual([
      "Keep same deck✓",
      "Roronoa Zoro · OP01-001",
      "Zoro Aggro" + "50 cards",
      "Monkey.D.Luffy · ST01-001",
      "Luffy Mid" + "48 cards",
    ]);
    const names = button().getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(names).toContain("Deck for the rematch");
  });

  it("lists a later deck of the same Leader right after the first, under one header (#1294)", () => {
    const zoro2: RematchDeckOption = { ...zoro, id: "zoro2", name: "Zoro Control" };
    mount(<RematchPanel state={state()} mySeat={0} players={null} deckOptions={[zoro, luffy, zoro2]} onAction={onAction} />);
    act(() => changeDeck()!.click());
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!.click());
    const rows = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(rows.map((r) => r.textContent)).toEqual([
      "Keep same deck✓",
      "Roronoa Zoro · OP01-001",
      "Zoro Aggro" + "50 cards",
      "Zoro Control" + "50 cards",
      "Monkey.D.Luffy · ST01-001",
      "Luffy Mid" + "48 cards",
    ]);
    expect(rows[1]!.hasAttribute("data-disabled")).toBe(true);
  });

  it("picking a deck updates the trigger and sends that deck with the request (#479, #772)", () => {
    const { button, rows } = openPicker(0);
    expect(button().textContent).toContain("Keep same deck");
    act(() => rows()[4]!.click());
    expect(button().textContent).toContain("Luffy Mid");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    act(() => [...host!.querySelectorAll("button")].find((b) => b.textContent === "Ask for a rematch")!.click());
    expect(onAction).toHaveBeenCalledWith("request", [luffy.wire, undefined]);
  });

  it("practice shows one picker per seat (#479)", () => {
    const pickers = () => host!.querySelectorAll('button[aria-haspopup="listbox"]').length;
    mount(<RematchPanel state={state()} mySeat={0} players={null} autoAccept deckOptions={options} onAction={onAction} />);
    act(() => changeDeck()!.click());
    expect(pickers()).toBe(2);
    expect(host!.querySelector("select")).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    mount(<RematchPanel state={state()} mySeat={0} players={null} deckOptions={options} onAction={onAction} />);
    act(() => changeDeck()!.click());
    expect(pickers()).toBe(1);
  });

  it("keeps the deck select behind Change deck until it is asked for (#1343)", () => {
    expect(html(state())).toContain("Change deck");
    expect(html(state())).not.toContain("aria-haspopup");
    expect(html(state(), 0, true)).toContain("Change decks");
  });

  it("asks for the rematch with no deck while the select was never opened (#1343)", () => {
    mount(<RematchPanel state={state()} mySeat={0} players={null} deckOptions={options} onAction={onAction} />);
    act(() => [...host!.querySelectorAll("button")].find((b) => b.textContent === "Ask for a rematch")!.click());
    expect(onAction).toHaveBeenCalledWith("request", undefined);
  });

  it("tells you when the opponent is bringing a different deck, not when you are (#479)", () => {
    const s = state({ requested: [false, true], newDeck: [false, true] });
    expect(html(s, 0)).toContain("is bringing a different deck.");
    expect(html(s, 1)).not.toContain("is bringing a different deck.");
  });
});

describe("rematchStage decides which button is gold (#1343)", () => {
  it("is ask, accept or waiting by who has asked (#1343)", () => {
    expect(rematchStage(state(), 0)).toBe("ask");
    expect(rematchStage(state({ requested: [false, true] }), 0)).toBe("accept");
    expect(rematchStage(state({ requested: [true, false] }), 0)).toBe("waiting");
    expect(rematchStage(state({ requested: [false, true] }), 1)).toBe("waiting");
  });

  it("has no rematch offer when the opponent left or there is no state, which leaves Return home gold (#1343)", () => {
    expect(rematchStage(state({ available: false }), 0)).toBe("left");
    expect(rematchStage(null, 0)).toBe("none");
  });

  it("asks only the loser to choose the turn order, unless it is practice (#1343)", () => {
    const chosen = state({ requested: [true, true], chooser: 0 });
    expect(rematchStage(chosen, 0)).toBe("order");
    expect(rematchStage(chosen, 1)).toBe("order-wait");
    expect(rematchStage(chosen, 1, true)).toBe("order");
  });
});
