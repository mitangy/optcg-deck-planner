import { describe, expect, it } from "vitest";
import { actionKeyTags, hotkeyAction, stepHandSelection, type HotkeyContext } from "./hotkeys";

const base: HotkeyContext = {
  typing: false,
  focus: "none",
  modalOpen: false,
  spectating: false,
  over: false,
  wide: true,
  cardKeys: true,
  escOwned: false,
};
const space = { key: " ", code: "Space" };

describe("hotkeyAction", () => {
  it("fires the primary action on Space", () => {
    expect(hotkeyAction(space, base)).toBe("primary");
  });

  it("ignores every key while typing in a text field", () => {
    const ctx = { ...base, typing: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "3" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "a" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "ArrowRight" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "Escape" }, ctx)).toBeNull();
  });

  it("leaves Space to a keyboard-focused button", () => {
    expect(hotkeyAction(space, { ...base, focus: "control" })).toBeNull();
  });

  it("still ends the turn with Space while a board or hand card has focus (#257)", () => {
    expect(hotkeyAction(space, { ...base, focus: "card" })).toBe("primary");
  });

  it("ignores a held Space so End turn cannot arm and confirm itself", () => {
    expect(hotkeyAction({ ...space, repeat: true }, base)).toBeNull();
  });

  it("toggles the hand only on the wide layout", () => {
    expect(hotkeyAction({ key: "h" }, base)).toBe("toggle_hand");
    expect(hotkeyAction({ key: "h" }, { ...base, wide: false })).toBeNull();
  });

  it("matches letter keys case-insensitively", () => {
    expect(hotkeyAction({ key: "H" }, base)).toBe("toggle_hand");
    expect(hotkeyAction({ key: "S" }, base)).toBe("sort_hand");
  });

  it("sorts the hand on S", () => {
    expect(hotkeyAction({ key: "s" }, base)).toBe("sort_hand");
  });

  it("opens help on ?", () => {
    expect(hotkeyAction({ key: "?" }, base)).toBe("help");
  });

  it("gives spectators only the help list", () => {
    const ctx = { ...base, spectating: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "h" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBe("help");
    expect(hotkeyAction({ key: "3" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "e" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "ArrowLeft" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "Escape" }, ctx)).toBeNull();
  });

  it("does nothing while a modal is open", () => {
    const ctx = { ...base, modalOpen: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "h" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "2" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "p" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "ArrowRight" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "Escape" }, ctx)).toBeNull();
  });

  it("ignores ctrl, meta and alt combinations", () => {
    expect(hotkeyAction({ ...space, ctrlKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "s", metaKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "h", altKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "1", ctrlKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "a", metaKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "ArrowLeft", altKey: true }, base)).toBeNull();
  });

  it("does nothing once the match is over", () => {
    const ctx = { ...base, over: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "1" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "d" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "Escape" }, ctx)).toBeNull();
  });

  it("presses the Nth action button on 1-9", () => {
    expect(hotkeyAction({ key: "1" }, base)).toEqual({ kind: "slot", n: 1 });
    expect(hotkeyAction({ key: "7" }, base)).toEqual({ kind: "slot", n: 7 });
    expect(hotkeyAction({ key: "9" }, base)).toEqual({ kind: "slot", n: 9 });
    expect(hotkeyAction({ key: "0" }, base)).toBeNull();
  });

  it("maps A, E, P and D to their mnemonic letter, either case", () => {
    expect(hotkeyAction({ key: "a" }, base)).toEqual({ kind: "letter", letter: "a" });
    expect(hotkeyAction({ key: "E" }, base)).toEqual({ kind: "letter", letter: "e" });
    expect(hotkeyAction({ key: "p" }, base)).toEqual({ kind: "letter", letter: "p" });
    expect(hotkeyAction({ key: "D" }, base)).toEqual({ kind: "letter", letter: "d" });
    expect(hotkeyAction({ key: "x" }, base)).toBeNull();
  });

  it("leaves card keys to phones and landscape phones", () => {
    const ctx = { ...base, cardKeys: false };
    expect(hotkeyAction({ key: "1" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "a" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "ArrowRight" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBe("sort_hand");
  });

  it("ignores a held number or letter so a play cannot repeat", () => {
    expect(hotkeyAction({ key: "2", repeat: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "p", repeat: true }, base)).toBeNull();
  });

  it("steps the hand with the arrow keys", () => {
    expect(hotkeyAction({ key: "ArrowLeft" }, base)).toBe("hand_prev");
    expect(hotkeyAction({ key: "ArrowRight" }, base)).toBe("hand_next");
  });

  it("Esc deselects unless a popover owns it", () => {
    expect(hotkeyAction({ key: "Escape" }, base)).toBe("escape");
    expect(hotkeyAction({ key: "Escape" }, { ...base, escOwned: true })).toBeNull();
  });
});

describe("actionKeyTags", () => {
  const types = (...t: string[]) => t.map((type) => ({ type }));

  it("tags the first button of each mnemonic with its letter and numbers the rest", () => {
    const tags = actionKeyTags(
      types("play_card", "declare_attack", "declare_attack", "activate_ability", "activate_leader", "give_don", "give_don"),
    );
    expect(tags.map((t) => t.tag)).toEqual(["P", "A", "3", "E", "5", "D", "7"]);
    expect(tags.map((t) => t.letter)).toEqual(["p", "a", null, "e", null, "d", null]);
    expect(tags.map((t) => t.num)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("gives buttons without a mnemonic just their number", () => {
    expect(actionKeyTags(types("end_turn", "counter_event")).map((t) => t.tag)).toEqual(["1", "2"]);
  });

  it("stops numbering after the ninth button", () => {
    const tags = actionKeyTags(types(...Array(10).fill("counter_event")));
    expect(tags[8]).toEqual({ num: 9, letter: null, tag: "9" });
    expect(tags[9]).toEqual({ num: null, letter: null, tag: "" });
  });
});

describe("stepHandSelection", () => {
  // Sorted hand: display order differs from hand-index order.
  const order = [2, 0, 1];

  it("moves through the display order, not the hand indexes", () => {
    expect(stepHandSelection(order, 0, 1)).toBe(1);
    expect(stepHandSelection(order, 0, -1)).toBe(2);
    expect(stepHandSelection(order, 2, 1)).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(stepHandSelection(order, 1, 1)).toBe(2);
    expect(stepHandSelection(order, 2, -1)).toBe(1);
  });

  it("starts at the first card when nothing (or a stale card) is selected", () => {
    expect(stepHandSelection(order, null, 1)).toBe(2);
    expect(stepHandSelection(order, null, -1)).toBe(2);
    expect(stepHandSelection(order, 7, 1)).toBe(2);
  });

  it("selects nothing from an empty hand", () => {
    expect(stepHandSelection([], null, 1)).toBeNull();
  });
});
