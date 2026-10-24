// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UndoState } from "../net/protocol";
import { NavMenu } from "../nav/NavMenu";
import { MatchMenu } from "./MatchMenu";
import { UndoControl } from "./UndoControl";
import { useBoardHotkeys } from "./useBoardHotkeys";

let root: Root | null = null;
let host: HTMLElement | null = null;
const onSortHand = vi.fn();
const onAction = vi.fn();
const onSettings = vi.fn();
const onConcede = vi.fn();
const onLeave = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const f of [onSortHand, onAction, onSettings, onConcede, onLeave]) f.mockClear();
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function mount(ui: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  await act(async () => {
    await wait();
  });
}

async function press(key: string) {
  await act(async () => {
    const el = document.activeElement ?? document.body;
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
    await wait();
  });
}

/** The board's own hotkeys around a menu, wired like DuelBoard wires them. */
function Board({ children }: { children: ReactNode }) {
  useBoardHotkeys({
    spectating: false,
    over: false,
    wide: true,
    cardKeys: true,
    onEscape: () => {},
    onStepHand: () => {},
    onToggleHand: () => {},
    handHides: false,
    onHideHand: () => {},
    onSortHand,
    onHelp: () => {},
    fullscreenOffered: false,
    onToggleFullscreen: () => {},
  });
  return <div className="board-root">{children}</div>;
}

const free = { available: true, forceable: false } as const;
const base: UndoState = {
  enabled: true,
  targetTurn: 3,
  action: { seat: 0, label: "play Nami" },
  options: { action: { ...free, steps: 1 }, turn: { ...free, steps: 3 } },
  blockedReason: null,
  pending: null,
};
const REVEAL = "Undo stops here: cards were drawn from a deck";
const revealed: UndoState = {
  ...base,
  options: {
    action: { available: false, forceable: true, steps: 1, blockedReason: REVEAL, revealReason: "cards were drawn" },
    turn: { available: false, forceable: true, steps: 3, blockedReason: REVEAL, revealReason: "cards were drawn" },
  },
  blockedReason: REVEAL,
};

const undoButton = () => document.querySelector<HTMLButtonElement>("button.hud-undo-btn")!;
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const active = () => document.getElementById(menu()!.getAttribute("aria-activedescendant") ?? "");

const undo = (state: UndoState = base) => (
  <Board>
    <UndoControl state={state} autoAccept={false} className="hud-undo-btn" label="↺ Undo" onAction={onAction} />
  </Board>
);

async function openWithKeyboard(button: HTMLElement) {
  button.focus();
  await press("ArrowDown");
}

describe("Undo menu on the shared Menu (#715)", () => {
  it("opens from the keyboard in a portal with the first row active, and arrow keys move to the next (#715)", async () => {
    await mount(undo());
    await openWithKeyboard(undoButton());
    expect(menu()).not.toBeNull();
    expect(host!.contains(menu())).toBe(false);
    expect(rows().map((r) => r.querySelector(".undo-menu-label")!.textContent)).toEqual(["Last action: play Nami", "Whole turn (3 actions)"]);
    expect(active()).toBe(rows()[0]);
    await press("ArrowDown");
    expect(active()).toBe(rows()[1]);
    await press("ArrowUp");
    expect(active()).toBe(rows()[0]);
  });

  it("Enter sends the active row's request and closes the menu (#715)", async () => {
    await mount(undo());
    await openWithKeyboard(undoButton());
    await press("ArrowDown");
    await press("Enter");
    expect(onAction).toHaveBeenCalledExactlyOnceWith("request", { scope: "turn" });
    expect(menu()).toBeNull();
  });

  it("arrow keys skip a blocked row and Enter on a Force row forces it (#715)", async () => {
    await mount(undo(revealed));
    await openWithKeyboard(undoButton());
    expect(rows()).toHaveLength(4);
    expect(active()).toBe(rows()[1]);
    await press("Enter");
    expect(onAction).toHaveBeenCalledExactlyOnceWith("request", { scope: "action", force: true });
  });

  it("clicking a blocked row does nothing and leaves the menu open (#715)", async () => {
    await mount(undo(revealed));
    await openWithKeyboard(undoButton());
    await act(async () => {
      rows()[0]!.click();
      await wait();
    });
    expect(onAction).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("Escape closes it and focus returns to the Undo button (#715)", async () => {
    await mount(undo());
    await openWithKeyboard(undoButton());
    await press("Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(undoButton());
  });

  it("board hotkeys stay quiet while it is open and work again once it closes (#715)", async () => {
    await mount(undo());
    await openWithKeyboard(undoButton());
    await press("s");
    expect(onSortHand).not.toHaveBeenCalled();
    await press("Escape");
    await press("s");
    expect(onSortHand).toHaveBeenCalledTimes(1);
  });

  it("a new undo state closes an open menu (#715)", async () => {
    await mount(undo());
    await openWithKeyboard(undoButton());
    expect(menu()).not.toBeNull();
    await act(async () => root!.render(undo(revealed)));
    await act(async () => {
      await wait();
    });
    expect(menu()).toBeNull();
  });
});

const items = ["copy-room", "settings", "concede", "leave"] as const;

function match() {
  return (
    <Board>
      <MatchMenu
        items={[...items]}
        info={{ matchup: "You vs Zoro", seat: null, order: "You go first" }}
        roomId="room-1"
        isFullscreen={false}
        onSettings={onSettings}
        onToggleFullscreen={() => {}}
        onReport={() => {}}
        onConcede={onConcede}
        onLeave={onLeave}
      />
    </Board>
  );
}

const matchButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Match menu"]')!;
const rowNamed = (name: RegExp) => rows().find((r) => name.test(r.textContent ?? ""))!;

describe("Match menu on the shared Menu (#715)", () => {
  it("is a named menu with the info header and one row per entry, and arrow keys walk the rows (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    expect(menu()!.getAttribute("aria-labelledby")).toBe(matchButton().id);
    expect(menu()!.textContent).toContain("You vs Zoro");
    expect(rows()).toHaveLength(4);
    expect(rows().map((r) => r.textContent?.slice(0, 7))).toEqual(["Copy ro", "Gamepla", "Concede", "Leave m"]);
    expect(active()).toBe(rows()[0]);
    await press("ArrowDown");
    expect(active()).toBe(rows()[1]);
    await press("End");
    expect(active()).toBe(rows()[3]);
    await press("Home");
    expect(active()).toBe(rows()[0]);
  });

  it("Enter on Gameplay settings runs it once and closes the menu (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await press("ArrowDown");
    await press("Enter");
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("Escape closes it and focus returns to the button (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await press("Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(matchButton());
  });

  it("Concede takes two Enters: the first arms it and the menu stays open, the second concedes and closes (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await press("End");
    await press("ArrowUp");
    expect(active()).toBe(rowNamed(/Concede/));
    await press("Enter");
    expect(onConcede).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
    expect(rowNamed(/Concede/).classList.contains("armed")).toBe(true);
    await press("Enter");
    expect(onConcede).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("a pointer click on Concede arms it first too (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await act(async () => {
      rowNamed(/Concede/).click();
      await wait();
    });
    expect(onConcede).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
    await act(async () => {
      rowNamed(/Concede/).click();
      await wait();
    });
    expect(onConcede).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("Copy room ID stays open to flash its result, then closes by itself (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await press("Enter");
    expect(menu()).not.toBeNull();
    await act(async () => {
      await wait(800);
    });
    expect(menu()).toBeNull();
  });

  it("board hotkeys stay quiet while it is open (#715)", async () => {
    await mount(match());
    await openWithKeyboard(matchButton());
    await press("s");
    expect(onSortHand).not.toHaveBeenCalled();
    await press("Escape");
    await press("s");
    expect(onSortHand).toHaveBeenCalledTimes(1);
  });
});

describe("Site menu drawer on the shared Dialog (#715)", () => {
  const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const hamburger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')!;
  const ui = (
    <MemoryRouter>
      <NavMenu />
    </MemoryRouter>
  );

  it("opens as a named modal with focus on its first link and Escape returns focus to the hamburger (#715)", async () => {
    await mount(ui);
    hamburger().focus();
    await act(async () => {
      hamburger().click();
      await wait();
    });
    expect(drawer()!.getAttribute("aria-label")).toBe("Site menu");
    expect(drawer()!.getAttribute("aria-modal")).toBe("true");
    expect(hamburger().getAttribute("aria-expanded")).toBe("true");
    expect(drawer()!.contains(document.activeElement)).toBe(true);
    await press("Escape");
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(hamburger());
  });

  it("the page behind is hidden from assistive tech while it is open (#715)", async () => {
    await mount(ui);
    await act(async () => {
      hamburger().click();
      await wait();
    });
    expect(host!.getAttribute("aria-hidden")).toBe("true");
  });

  it("a click on the backdrop closes it and a click inside the drawer does not (#715)", async () => {
    await mount(ui);
    await act(async () => {
      hamburger().click();
      await wait();
    });
    await act(async () => {
      drawer()!.querySelector(".nav-drawer-nav")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await wait();
    });
    expect(drawer()).not.toBeNull();
    await act(async () => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        drawer()!.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      }
      await wait();
    });
    expect(drawer()).toBeNull();
  });
});
