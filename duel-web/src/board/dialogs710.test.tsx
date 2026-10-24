// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GameplaySettingsSheet } from "./GameplaySettings";
import { MovedElsewhereOverlay } from "./MovedElsewhereOverlay";
import { useBoardHotkeys } from "./useBoardHotkeys";
import { ImageEditor } from "../cosmetics/ImageEditor";
import { ReplayControls } from "../replay/ReplayControls";
import type { ReplayControlsActions, ReplayControlsState } from "../replay/useReplay";

let root: Root | null = null;
let host: HTMLElement | null = null;
const onEscape = vi.fn();
const onHelp = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Compact layout (phone): the replay's More sheet exists only there.
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onEscape.mockClear();
  onHelp.mockClear();
});

/** The board's own hotkeys plus a trigger that opens `children(close)`, wired like DuelBoard wires its modals. */
function Board({ children, startOpen = false }: { children: (close: () => void) => ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
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
    onHelp,
    fullscreenOffered: false,
    onToggleFullscreen: () => {},
  });
  return (
    <div className="board-root">
      <button type="button" id="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? children(() => setOpen(false)) : null}
    </div>
  );
}

async function mount(ui: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 40));
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await new Promise((r) => setTimeout(r, 40));
  });
}

const trigger = () => document.getElementById("trigger") as HTMLButtonElement;
const modal = () => document.querySelector<HTMLElement>('[aria-modal="true"]');

async function openFromTrigger() {
  trigger().focus();
  await act(async () => {
    trigger().click();
    await new Promise((r) => setTimeout(r, 40));
  });
}

describe("Gameplay settings sheet on the shared Dialog", () => {
  const ui = <Board>{(close) => <GameplaySettingsSheet onClose={close} />}</Board>;

  it("opens as a modal named Gameplay settings, with focus inside, and Escape closes it and returns focus (#710)", async () => {
    await mount(ui);
    await openFromTrigger();
    expect(modal()!.getAttribute("aria-label")).toBe("Gameplay settings");
    expect(modal()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("a board key typed inside the open settings sheet does nothing (#710)", async () => {
    await mount(ui);
    await openFromTrigger();
    await press("?");
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("a click on the backdrop closes it, a click inside the sheet does not (#710)", async () => {
    await mount(ui);
    await openFromTrigger();
    await click(modal()!.querySelector(".sheet-head")!);
    expect(modal()).not.toBeNull();
    await click(modal()!);
    expect(modal()).toBeNull();
  });
});

describe("Continued-on-another-device notice on the shared Dialog", () => {
  const ui = (
    <Board startOpen>
      {(close) => <MovedElsewhereOverlay onPlayHere={() => {}} onLeave={close} />}
    </Board>
  );

  it("is an alert dialog that Escape and an outside click do not dismiss (#710)", async () => {
    await mount(ui);
    const d = modal()!;
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.textContent).toContain("Continued on another device");
    await press("Escape");
    expect(modal()).not.toBeNull();
    await click(modal()!);
    expect(modal()).not.toBeNull();
  });

  it("keeps focus on its buttons, and board keys do nothing behind it (#710)", async () => {
    await mount(ui);
    expect(modal()!.contains(document.activeElement)).toBe(true);
    await press("?");
    expect(onHelp).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe("Image editor on the shared Dialog", () => {
  const file = new File(["x"], "mat.png", { type: "image/png" });
  const onCancel = vi.fn();
  const editor = (close: () => void) => (
    <ImageEditor
      file={file}
      aspect={12 / 7}
      title="Edit playmat"
      outputWidth={600}
      onCancel={() => {
        onCancel();
        close();
      }}
      onApply={() => {}}
    />
  );

  afterEach(() => onCancel.mockClear());

  it("opens as a modal named by its title, focus moves in, and Escape cancels it and returns focus (#710)", async () => {
    await mount(<Board>{editor}</Board>);
    await openFromTrigger();
    expect(modal()!.getAttribute("aria-label")).toBe("Edit playmat");
    expect(modal()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("a click beside the editor does not throw the crop away (#710)", async () => {
    await mount(<Board>{editor}</Board>);
    await openFromTrigger();
    await click(modal()!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(modal()).not.toBeNull();
  });

  it("board keys do nothing while the editor is open (#710)", async () => {
    await mount(<Board>{editor}</Board>);
    await openFromTrigger();
    await press("?");
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("the crop frame is measured once the dialog has mounted its content (#710)", async () => {
    const seen: number[] = [];
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        if (this.classList?.contains("img-editor-frame")) seen.push(1);
        return 300;
      },
    });
    try {
      await mount(<Board startOpen>{editor}</Board>);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });
});

describe("Replay More sheet on the shared Dialog", () => {
  const state: ReplayControlsState = {
    step: 0,
    total: 10,
    turn: 1,
    turns: [{ turn: 1, step: 0 }],
    playing: false,
    speed: 1,
    revealAll: false,
    cameraSeat: 0,
    yourSeat: 0,
    playerNames: ["You", "Nami"],
  };
  const noop = () => {};
  const actions: ReplayControlsActions = {
    togglePlay: noop,
    stepBy: noop,
    goTo: noop,
    prevTurn: noop,
    nextTurn: noop,
    goTurn: noop,
    setSpeed: noop,
    setRevealAll: noop,
    flip: noop,
  };
  const more = () => document.querySelector<HTMLButtonElement>('button[aria-label="More replay options"]')!;
  const opened = () => document.querySelector<HTMLElement>('[aria-label="More replay options"][role="dialog"]');

  it("opens as a modal, focus moves in, and Escape closes it and returns focus to More (#710)", async () => {
    await mount(<ReplayControls state={state} actions={actions} />);
    more().focus();
    await act(async () => {
      more().click();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(opened()!.getAttribute("aria-modal")).toBe("true");
    expect(opened()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(opened()).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it("a click outside the sheet closes it, a click on the sheet does not, and Done closes it (#710)", async () => {
    await mount(<ReplayControls state={state} actions={actions} />);
    await click(more());
    expect(opened()).not.toBeNull();
    await click(document.querySelector(".replay-more-sheet")!);
    expect(opened()).not.toBeNull();
    await click(opened()!);
    expect(opened()).toBeNull();
    await click(more());
    await click(document.querySelector(".replay-more-done")!);
    expect(opened()).toBeNull();
  });

  it("Space does not play the replay while the sheet is open (#710)", async () => {
    const togglePlay = vi.fn();
    await mount(<ReplayControls state={state} actions={{ ...actions, togglePlay }} />);
    await click(more());
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    });
    expect(togglePlay).not.toHaveBeenCalled();
  });
});
