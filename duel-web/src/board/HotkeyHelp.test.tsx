// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HotkeyHelpSheet } from "./HotkeyHelp";
import { useBoardHotkeys } from "./useBoardHotkeys";

let root: Root | null = null;
let host: HTMLElement | null = null;
const onEscape = vi.fn();
const onHelp = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onEscape.mockClear();
  onHelp.mockClear();
});

/** The board's own hotkeys plus the "?" sheet, wired like DuelBoard wires them. */
function Board() {
  const [helpOpen, setHelpOpen] = useState(false);
  useBoardHotkeys({
    spectating: false,
    over: false,
    wide: true,
    cardKeys: true,
    onEscape,
    onStepHand: () => {},
    onToggleHand: () => {},
    handHides: false,
    onHideHand: () => {},
    onSortHand: () => {},
    onHelp: () => {
      onHelp();
      setHelpOpen(true);
    },
    fullscreenOffered: false,
    onToggleFullscreen: () => {},
  });
  return (
    <div className="board-root">
      <button type="button" id="settings" onClick={() => setHelpOpen(true)}>
        Settings
      </button>
      {helpOpen ? <HotkeyHelpSheet onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Board />));
}

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 40));
  });
}

const sheet = () => document.querySelector<HTMLElement>(".sheet-backdrop");

describe("HotkeyHelpSheet", () => {
  it("? opens it as a modal named Keyboard shortcuts (#700-2)", async () => {
    await mount();
    await press("?");
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(sheet()!.getAttribute("role")).toBe("dialog");
    expect(sheet()!.getAttribute("aria-label")).toBe("Keyboard shortcuts");
    expect(sheet()!.querySelector(".sheet .hotkey-row")).not.toBeNull();
  });

  it("Escape closes the sheet and the board's own Escape does not also run (#700-2)", async () => {
    await mount();
    await press("?");
    await press("Escape");
    expect(sheet()).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("Escape reaches the board again once the sheet is closed (#700-2)", async () => {
    await mount();
    await press("?");
    await press("Escape");
    await press("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("a board key typed inside the open sheet does nothing (#700-2)", async () => {
    await mount();
    await press("?");
    await press("?");
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(sheet()).not.toBeNull();
  });

  it("focus moves into the sheet and returns to the control that opened it (#700-2)", async () => {
    await mount();
    const settings = document.getElementById("settings") as HTMLButtonElement;
    settings.focus();
    await act(async () => {
      settings.click();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(sheet()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(settings);
  });

  it("a click on the backdrop closes it, a click on the list does not (#700-2)", async () => {
    await mount();
    await press("?");
    const click = async (el: Element) =>
      act(async () => {
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
        }
        await new Promise((r) => setTimeout(r, 40));
      });
    await click(sheet()!.querySelector(".hotkey-list")!);
    expect(sheet()).not.toBeNull();
    await click(sheet()!);
    expect(sheet()).toBeNull();
  });
});
