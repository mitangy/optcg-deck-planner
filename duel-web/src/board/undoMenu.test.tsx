// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { UndoPending, UndoState } from "../net/protocol";
import { UndoControl } from "./UndoControl";
import { undoBlocked, undoButtonTitle, undoMenuModel, undoRequestText } from "./undoMenu";

const free = { available: true, forceable: false } as const;
const base: UndoState = {
  enabled: true,
  targetTurn: 3,
  action: { seat: 0, label: "play Nami" },
  options: { action: { ...free, steps: 1 }, turn: { ...free, steps: 3 } },
  blockedReason: null,
  pending: null,
};
const REASON = "Undo stops here: cards were drawn from a deck";
const revealed: UndoState = {
  ...base,
  options: {
    action: { available: false, forceable: true, steps: 1, blockedReason: REASON, revealReason: "cards were drawn from a deck" },
    turn: { available: false, forceable: true, steps: 3, blockedReason: REASON, revealReason: "cards were drawn from a deck" },
  },
  blockedReason: REASON,
};

describe("undo menu rows (#536)", () => {
  it("offers the last action and the whole turn when the turn took several actions (#536)", () => {
    const m = undoMenuModel(base);
    expect(m.items.map((i) => [i.label, i.request, i.disabled])).toEqual([
      ["Last action: play Nami", { scope: "action" }, false],
      ["Whole turn (3 actions)", { scope: "turn" }, false],
    ]);
  });

  it("hides the whole-turn row when the turn is the one action (#536)", () => {
    const one = { ...base, options: { action: { ...free, steps: 1 }, turn: { ...free, steps: 1 } } };
    expect(undoMenuModel(one).items.map((i) => i.key)).toEqual(["action"]);
  });

  it("a reveal disables the row with its reason and adds a Force row per option (#536)", () => {
    const m = undoMenuModel(revealed);
    expect(m.items.map((i) => [i.key, i.disabled, i.warn, i.reason ?? null, i.request])).toEqual([
      ["action", true, false, REASON, { scope: "action" }],
      ["action-force", false, true, null, { scope: "action", force: true }],
      ["turn", true, false, REASON, { scope: "turn" }],
      ["turn-force", false, true, null, { scope: "turn", force: true }],
    ]);
  });

  it("history running out blocks the turn row without a Force row (#536)", () => {
    const limit: UndoState = {
      ...base,
      options: { action: { ...free, steps: 1 }, turn: { available: false, forceable: false, steps: 0, blockedReason: "Undo history limit reached" } },
    };
    const m = undoMenuModel(limit);
    expect(m.items.map((i) => [i.key, i.disabled, i.reason ?? null])).toEqual([
      ["action", false, null],
      ["turn", true, "Undo history limit reached"],
    ]);
  });

  it("with nothing to undo there are no rows, only the reason (#536)", () => {
    const none: UndoState = {
      ...base,
      targetTurn: null,
      action: null,
      options: { action: { available: false, forceable: false, steps: 0, blockedReason: "Nothing to undo yet" }, turn: { available: false, forceable: false, steps: 0, blockedReason: "Nothing to undo yet" } },
      blockedReason: "Nothing to undo yet",
    };
    expect(undoMenuModel(none)).toEqual({ items: [], reason: "Nothing to undo yet" });
  });

  it("an older server (no scopes) offers just the last action (#536)", () => {
    const old: UndoState = { ...base, options: null };
    expect(undoMenuModel(old).items.map((i) => i.request)).toEqual([{ scope: "action" }]);
  });
});

describe("undo button hover (#536)", () => {
  it("says why it is blocked, and points at the menu when forcing is possible (#536)", () => {
    expect(undoButtonTitle(revealed, false)).toBe(`${REASON}. Open the menu to force it.`);
    const none: UndoState = { ...base, targetTurn: null, options: null, blockedReason: "No undo in ranked" };
    expect(undoButtonTitle(none, false)).toBe("No undo in ranked");
    expect(undoBlocked(none)).toBe(true);
  });

  it("names the action and who must accept when it is not blocked (#536)", () => {
    expect(undoBlocked(base)).toBe(false);
    expect(undoButtonTitle(base, false)).toBe("Undo: play Nami (your opponent must accept)");
    expect(undoButtonTitle(base, true)).toBe("Undo: play Nami");
  });
});

describe("undo menu markup (#536)", () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  let unmount: (() => void) | null = null;
  afterEach(() => {
    unmount?.();
    unmount = null;
  });

  /** The open menu's markup: the list is in a portal, so read the whole body. */
  async function html(s: UndoState): Promise<string> {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    await act(async () => root.render(<UndoControl state={s} autoAccept={false} className="hud-undo-btn" label="Undo" onAction={() => {}} />));
    host.querySelector("button")!.focus();
    await act(async () => {
      host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 40));
    });
    return document.body.innerHTML;
  }

  it("shows a blocked row's reason as text and styles Force as a warning (#536)", async () => {
    const h = await html(revealed);
    expect(h).toContain(REASON);
    expect(h).toMatch(/class="undo-menu-item is-disabled"[^>]*aria-disabled="true"/);
    expect(h).toMatch(/class="undo-menu-item is-warn"/);
    expect(h).toContain("Force undo whole turn");
  });

  it("a dimmed Undo still opens its menu with the reason (#717)", async () => {
    const none: UndoState = { ...base, targetTurn: null, action: null, options: null, blockedReason: "Nothing to undo yet" };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    await act(async () => root.render(<UndoControl state={none} autoAccept={false} className="hud-undo-btn" label="Undo" onAction={() => {}} />));
    const btn = host.querySelector("button")!;
    expect(btn.className).toContain("is-blocked");
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(document.querySelector("[role=menu]")).not.toBeNull();
    expect(document.querySelector(".undo-menu-note")?.textContent).toBe("Nothing to undo yet");
  });

  it("shows the reason alone when there is nothing to choose (#536)", async () => {
    const h = await html({ ...base, targetTurn: null, action: null, options: null, blockedReason: "Nothing to undo yet" });
    expect(h).toContain("Nothing to undo yet");
    expect(h).not.toContain("undo-menu-item");
  });
});

describe("undo request dialog text (#536)", () => {
  const pending: UndoPending = { from: 1, toTurn: 3, action: { seat: 1, label: "attack with Zoro" }, scope: "action", steps: 1, force: false, revealReason: null };

  it("names the last action, or the whole turn with its size (#536)", () => {
    expect(undoRequestText(pending, 0)).toEqual({ what: "undo their last action: attack with Zoro", warning: null });
    expect(undoRequestText(pending, 1).what).toBe("undo your last action: attack with Zoro");
    expect(undoRequestText({ ...pending, scope: "turn", steps: 3 }, 0).what).toBe("undo their whole turn (3 actions)");
  });

  it("warns that a forced request lets them redo what was revealed (#536)", () => {
    const forced = { ...pending, force: true, revealReason: "cards were drawn from a deck" };
    expect(undoRequestText(forced, 0).warning).toBe("Cards were revealed (cards were drawn from a deck). Undoing lets them redo it.");
  });
});
