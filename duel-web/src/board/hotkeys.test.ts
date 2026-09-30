import { describe, expect, it } from "vitest";
import { hotkeyAction, type HotkeyContext } from "./hotkeys";

const base: HotkeyContext = {
  typing: false,
  keyboardFocusedControl: false,
  modalOpen: false,
  spectating: false,
  over: false,
  wide: true,
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
  });

  it("leaves Space to a keyboard-focused button", () => {
    expect(hotkeyAction(space, { ...base, keyboardFocusedControl: true })).toBeNull();
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
  });

  it("does nothing while a modal is open", () => {
    const ctx = { ...base, modalOpen: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "h" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBeNull();
  });

  it("ignores ctrl, meta and alt combinations", () => {
    expect(hotkeyAction({ ...space, ctrlKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "s", metaKey: true }, base)).toBeNull();
    expect(hotkeyAction({ key: "h", altKey: true }, base)).toBeNull();
  });

  it("does nothing once the match is over", () => {
    const ctx = { ...base, over: true };
    expect(hotkeyAction(space, ctx)).toBeNull();
    expect(hotkeyAction({ key: "s" }, ctx)).toBeNull();
    expect(hotkeyAction({ key: "?" }, ctx)).toBeNull();
  });
});
