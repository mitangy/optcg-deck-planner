// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENED_DRAFTS_KEY, parseDraft } from "./drafts";
import { NewDeckCard } from "./NewDeckCard";
import { SourceHooksContext, type SourceHooks } from "./Sources";

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

const draft = parseDraft({
  id: "d1",
  version: 1,
  name: "Red Luffy",
  leader_id: "ST01-001",
  leader_name: "Monkey.D.Luffy",
  summary: "Plain red beats.",
  cards: [
    { id: "ST01-003", name: "Nami", copies: 4 },
    { id: "ST01-015", name: "Gum-Gum Jet Pistol", copies: 2 },
  ],
  count: 6,
  legality: { legal: true, problems: [], upcoming: [], ban_list_checked: true },
})!;
const LIST = "1xST01-001\n4xST01-003\n2xST01-015";

async function render(props: { live: boolean; hooks: SourceHooks; onOpened?: () => void }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SourceHooksContext.Provider value={props.hooks}>
        <NewDeckCard draft={draft} live={props.live} onOpened={props.onOpened} />
      </SourceHooksContext.Provider>,
    ),
  );
}
const text = () => host!.textContent ?? "";
const open = () => [...host!.querySelectorAll("button")].find((b) => b.textContent === "Open in deck builder") as HTMLButtonElement;

describe("NewDeckCard (#726)", () => {
  it("opens the create page once for a live draft with the name and list filled in, and tells the panel (#726)", async () => {
    const openNewDeck = vi.fn(() => true);
    const onOpened = vi.fn();
    await render({ live: true, hooks: { openNewDeck }, onOpened });
    expect(openNewDeck).toHaveBeenCalledTimes(1);
    expect(openNewDeck).toHaveBeenCalledWith({ name: "Red Luffy", list: LIST }, { auto: true });
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(OPENED_DRAFTS_KEY)!)).toEqual(["d1"]);
  });

  it("does not open by itself for a draft reloaded from the saved thread, but the button works (#726)", async () => {
    const openNewDeck = vi.fn(() => true);
    await render({ live: false, hooks: { openNewDeck } });
    expect(openNewDeck).not.toHaveBeenCalled();
    const onOpened = vi.fn();
    await act(async () =>
      root!.render(
        <SourceHooksContext.Provider value={{ openNewDeck }}>
          <NewDeckCard draft={draft} live={false} onOpened={onOpened} />
        </SourceHooksContext.Provider>,
      ),
    );
    await act(async () => open().click());
    expect(openNewDeck).toHaveBeenCalledWith({ name: "Red Luffy", list: LIST }, { auto: false });
    // The panel gets out of the way (phones) after the button too.
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("does not open again for a draft this device already opened (#726)", async () => {
    localStorage.setItem(OPENED_DRAFTS_KEY, JSON.stringify(["d1"]));
    const openNewDeck = vi.fn(() => true);
    await render({ live: true, hooks: { openNewDeck } });
    expect(openNewDeck).not.toHaveBeenCalled();
  });

  it("leaves the panel open and says to open it later when the app would not navigate, and never retries (#726)", async () => {
    const openNewDeck = vi.fn(() => false);
    const onOpened = vi.fn();
    await render({ live: true, hooks: { openNewDeck }, onOpened });
    expect(onOpened).not.toHaveBeenCalled();
    expect(text()).toContain("Open the deck builder after your game");
    expect(openNewDeck).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(OPENED_DRAFTS_KEY)!)).toEqual(["d1"]);
  });

  it("shows the leader, the count and a collapsible card list (#726)", async () => {
    await render({ live: false, hooks: { openNewDeck: () => true, card: (id) => ({ name: id === "ST01-003" ? "Nami (art)" : undefined }) } });
    expect(text()).toContain("New deck · Red Luffy");
    expect(text()).toContain("Monkey.D.Luffy");
    expect(text()).toContain("Plain red beats.");
    expect(text()).toContain("✓ Legal · 6 cards");
    expect(host!.querySelector("details")).toBeTruthy();
    expect(text()).toContain("Nami (art)");
    expect(text()).toContain("Gum-Gum Jet Pistol");
  });
});
