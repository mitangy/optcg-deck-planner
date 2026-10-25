// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckEditCard } from "./DeckEditCard";
import { SourceHooksContext, type SourceHooks } from "./Sources";
import { AUTO_APPLIED_KEY, parseProposal, type DeckEditOp, type DeckEditor } from "./proposals";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => localStorage.clear());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const wire = {
  id: "t1",
  version: 1,
  apply: true,
  target: { ref: "duel:d1", name: "Luffy", leader_id: "ST01-001" },
  summary: "Swap the event",
  lines: [
    { id: "ST01-016", name: "Diable Jambe", before: 0, after: 2, reason: "Cheaper" },
    { id: "ST01-015", name: "Gum-Gum Jet Pistol", before: 2, after: 0, reason: "Too slow" },
  ],
  base: [{ id: "ST01-015", copies: 2 }, { id: "ST01-003", copies: 4 }],
  legality: { legal: true, count: 50, problems: [], upcoming: [], ban_list_checked: true },
};
const BEFORE = [{ id: "ST01-015", copies: 2 }, { id: "ST01-003", copies: 4 }];
const AFTER = [{ id: "ST01-016", copies: 2 }, { id: "ST01-003", copies: 4 }];

const editor = (cards: { id: string; copies: number }[], apply: (ops: DeckEditOp[]) => Promise<void>, ref = "duel:d1"): DeckEditor => ({ ref, cards, apply });
const text = () => host!.textContent ?? "";
const button = (label: string) => [...host!.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

async function render(props: { apply?: boolean; live?: boolean; editor: DeckEditor | null; hooks?: SourceHooks; onNavigate?: () => void }) {
  const proposal = parseProposal({ ...wire, apply: props.apply ?? true })!;
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () =>
    root!.render(
      <SourceHooksContext.Provider value={props.hooks ?? {}}>
        <DeckEditCard proposal={proposal} editor={props.editor} live={props.live} onNavigate={props.onNavigate} />
      </SourceHooksContext.Provider>,
    ),
  );
}

describe("DeckEditCard auto-apply (#726)", () => {
  it("applies an edit Log Pose was asked to make once, and Undo does not apply it again (#726)", async () => {
    const calls: DeckEditOp[][] = [];
    const apply = vi.fn(async (ops: DeckEditOp[]) => void calls.push(ops));
    await render({ live: true, editor: editor(BEFORE, apply) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      { id: "ST01-016", before: 0, after: 2 },
      { id: "ST01-015", before: 2, after: 0 },
    ]);
    expect(JSON.parse(localStorage.getItem(AUTO_APPLIED_KEY)!)).toEqual(["t1"]);

    // The app saved it: the card shows it applied by Log Pose, with Undo.
    await render({ live: true, editor: editor(AFTER, apply) });
    expect(text()).toContain("Applied by Log Pose");
    expect(text()).toContain("Edit by Log Pose");
    await act(async () => button("Undo")!.click());
    expect(calls).toHaveLength(2);
    expect(calls[1]![0]).toEqual({ id: "ST01-016", before: 2, after: 0 });

    // Undone: the deck is back at "ready", and the card stays that way instead of applying again.
    await render({ live: true, editor: editor(BEFORE, apply) });
    await render({ live: true, editor: editor([...BEFORE], apply) });
    expect(calls).toHaveLength(2);
    expect(button("Apply")).toBeTruthy();
  });

  it("does not apply a plain suggestion (#726)", async () => {
    const apply = vi.fn(async () => {});
    await render({ apply: false, live: true, editor: editor(BEFORE, apply) });
    expect(apply).not.toHaveBeenCalled();
    expect(text()).toContain("Suggested edit");
  });

  it("does not apply an edit that came back from the saved thread (#726)", async () => {
    const apply = vi.fn(async () => {});
    await render({ live: false, editor: editor(BEFORE, apply) });
    expect(apply).not.toHaveBeenCalled();
    expect(button("Apply")).toBeTruthy();
  });

  it("does not apply an edit this device already handled (#726)", async () => {
    localStorage.setItem(AUTO_APPLIED_KEY, JSON.stringify(["t1"]));
    const apply = vi.fn(async () => {});
    await render({ live: true, editor: editor(BEFORE, apply) });
    expect(apply).not.toHaveBeenCalled();
  });

  it("waits for the deck's page, then applies when it opens (#726)", async () => {
    const apply = vi.fn(async () => {});
    await render({ live: true, editor: null });
    expect(apply).not.toHaveBeenCalled();
    expect(text()).toContain("Open Luffy to make this change");
    await render({ live: true, editor: editor(BEFORE, apply) });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("shows the error and keeps Apply when the automatic save fails, without retrying (#726)", async () => {
    const apply = vi.fn(async () => {
      throw new Error("Couldn't save the deck.");
    });
    await render({ live: true, editor: editor(BEFORE, apply) });
    await render({ live: true, editor: editor([...BEFORE], apply) });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Couldn't save the deck.");
    expect(button("Apply")).toBeTruthy();
  });

  it("links to the deck's page with 'make this change' for an edit Log Pose was asked to make (#726)", async () => {
    const hooks = { deckHref: (ref: string) => `/decks/${ref.slice(5)}/configure` };
    await render({ live: true, editor: null, hooks });
    const link = host!.querySelector("a.lp-edit-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/decks/d1/configure");
    expect(link.textContent).toBe("Open Luffy to make this change");
    await render({ apply: false, live: true, editor: null, hooks });
    expect((host!.querySelector("a.lp-edit-link") as HTMLElement).textContent).toBe("Open Luffy to apply");
  });

  it("opens the deck inside the app, without a page reload, and tells the panel (#726)", async () => {
    const openDeck = vi.fn(() => true);
    const onNavigate = vi.fn();
    await render({ live: true, editor: null, hooks: { deckHref: () => "/decks/d1/configure", openDeck }, onNavigate });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => void host!.querySelector("a.lp-edit-link")!.dispatchEvent(click));
    expect(openDeck).toHaveBeenCalledWith("duel:d1");
    expect(click.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("lets the link load the page when the app can't open the deck itself (#726)", async () => {
    const onNavigate = vi.fn();
    await render({ live: true, editor: null, hooks: { deckHref: () => "/decks/d1/configure", openDeck: () => false }, onNavigate });
    // A document listener sees the click after the card's own handler; it stops jsdom from really navigating.
    let prevented: boolean | null = null;
    document.addEventListener("click", (ev) => { prevented = ev.defaultPrevented; ev.preventDefault(); }, { once: true });
    await act(async () => void host!.querySelector("a.lp-edit-link")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(prevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
