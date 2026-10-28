// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { updateSettings, type DuelSettings } from "../settings";
import { GameplaySettingsFields } from "./GameplaySettings";
import { DESKTOP_BOARD_QUERY, PORTRAIT_MAT_QUERY } from "./useMediaQuery";

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Mounts the fields with only the listed media queries matching. */
async function mount(matching: string[], saved: Partial<DuelSettings> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: matching.includes(q), media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  act(() => {
    updateSettings({ handLayout: "auto", compactOwnBoard: true, ...saved });
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<GameplaySettingsFields />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  localStorage.clear();
});

/** The Select button: `disabled` is its own, the chosen label is its text (a native select had `value`). */
const select = (id: string) => document.getElementById(id) as HTMLButtonElement;
const notes = () => Array.from(document.querySelectorAll('[role="note"]')).map((n) => n.textContent ?? "");
const simpleBoard = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>(".switch input")).find((i) =>
    /Simple board/.test(i.closest("label")?.textContent ?? ""),
  )!;

describe("Gameplay rows that do nothing in this layout (#790)", () => {
  it("grays out Hand layout and Simple board with a note on a phone held sideways, keeping the saved values (#790)", async () => {
    await mount([], { handLayout: "fan", compactOwnBoard: true });
    expect(select("hand-layout").disabled).toBe(true);
    expect(select("hand-layout").textContent).toContain("Fan");
    expect(simpleBoard().disabled).toBe(true);
    expect(simpleBoard().checked).toBe(true);
    expect(notes().some((n) => /grid on the right/.test(n))).toBe(true);
    expect(notes().some((n) => /held upright/.test(n))).toBe(true);
    expect(select("life-fan").disabled).toBe(false);
  });

  it("keeps Hand layout and Simple board usable on a phone held upright, and grays Life stack direction while Simple board is on (#790)", async () => {
    await mount([PORTRAIT_MAT_QUERY], { compactOwnBoard: true });
    expect(select("hand-layout").disabled).toBe(false);
    expect(simpleBoard().disabled).toBe(false);
    expect(select("life-fan").disabled).toBe(true);
    expect(notes()).toHaveLength(1);
  });

  it("keeps Life stack direction usable upright with Simple board off (#790)", async () => {
    await mount([PORTRAIT_MAT_QUERY], { compactOwnBoard: false });
    expect(select("life-fan").disabled).toBe(false);
    expect(notes()).toHaveLength(0);
  });

  it("disables nothing on a desktop window (#790)", async () => {
    await mount([DESKTOP_BOARD_QUERY], { compactOwnBoard: true });
    expect(select("hand-layout").disabled).toBe(false);
    expect(select("life-fan").disabled).toBe(false);
    expect(notes()).toHaveLength(0);
  });
});
