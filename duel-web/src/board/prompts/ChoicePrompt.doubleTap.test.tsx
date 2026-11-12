// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChoiceOptionView, Intent, PendingChoiceView, PlayerView } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";
import { ChoicePrompt } from "./ChoicePrompt";
import { updateSettings } from "../../settings";

let root: Root | null = null;
let host: HTMLElement | null = null;

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
  vi.useRealTimers();
});

const view = {
  seat: 0,
  you: {
    leader: { id: "L0", defId: "ST01-001", power: 5000 },
    characters: [{ id: "c1", defId: "ST01-004" }, { id: "c2", defId: "ST01-008" }],
    stage: null,
    hand: [],
  },
  opponent: { leader: { id: "L1", defId: "ST01-001", power: 5000 }, characters: [], stage: null },
} as unknown as PlayerView;

const choice = (options: ChoiceOptionView[], min: number, max: number): PendingChoiceView =>
  ({ id: "p1", seat: 0, kind: "effect", cardDefId: "ST01-004", optional: false, prompt: "Pick.", request: { type: "select", min, max, options } }) as PendingChoiceView;
const inHand = (id: string, instanceId: string): ChoiceOptionView => ({ id, defId: "ST01-003", zone: "hand", ownerSeat: 1, instanceId, eligible: true });
const onField = (id: string, instanceId: string): ChoiceOptionView => ({ id, defId: "ST01-004", zone: "character", ownerSeat: 0, instanceId, eligible: true });

/** The prompt plus a stand-in for the board, whose field tiles are what the prompt's board clicks hit. */
function mount(c: PendingChoiceView) {
  const sent: Intent[] = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <div className="side-field">
          <CardTile defId="ST01-004" instanceId="c1" inspectGestures />
          <CardTile defId="ST01-008" instanceId="c2" inspectGestures />
        </div>
        <ChoicePrompt choice={c} mySeat={0} view={view} onSend={(i) => sent.push(i)} />
      </>,
    ),
  );
  return sent;
}

/** Two clicks then the dblclick a desktop browser adds, each a separate event like a real double-click. */
function doubleClick(el: Element) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  act(() => el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })));
}

const inspectOpen = () => document.querySelector(".card-inspect-backdrop") != null;

describe("double click on a prompt target (#1287)", () => {
  it("a double click on a pop-up grid card sends exactly one answer with that card and opens no inspect (#1287)", () => {
    const sent = mount(choice([inHand("o1", "h1"), inHand("o2", "h2")], 1, 1));
    const tiles = document.querySelectorAll(".choice-option .card-tile");
    doubleClick(tiles[1]!);
    expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o2"] }]);
    expect(inspectOpen()).toBe(false);
  });

  it("a single click on a grid card only picks it, and sends nothing after the double-click window (#1287)", () => {
    vi.useFakeTimers();
    const sent = mount(choice([inHand("o1", "h1"), inHand("o2", "h2")], 1, 1));
    const tile = document.querySelectorAll(".choice-option .card-tile")[0]!;
    act(() => tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    act(() => void vi.advanceTimersByTime(400));
    expect(sent).toEqual([]);
    expect(document.querySelector(".choice-option.selected")).not.toBeNull();
  });

  it("a double click when two picks are wanted picks the card and waits for the second (#1287)", () => {
    const sent = mount(choice([inHand("o1", "h1"), inHand("o2", "h2")], 2, 2));
    doubleClick(document.querySelectorAll(".choice-option .card-tile")[0]!);
    expect(sent).toEqual([]);
    expect(document.querySelector(".choice-option.selected")).not.toBeNull();
  });

  it("a double click on a board target of a field bar sends exactly one answer and opens no inspect (#1287)", () => {
    const sent = mount(choice([onField("o1", "c1"), onField("o2", "c2")], 1, 1));
    expect(document.querySelector(".field-bar")).not.toBeNull();
    doubleClick(document.querySelector('.side-field [data-instance-id="c2"]')!);
    expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o2"] }]);
    expect(inspectOpen()).toBe(false);
  });

  it("two single clicks on a field bar target, far apart, pick then un-pick without answering (#1287)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const sent = mount(choice([onField("o1", "c1"), onField("o2", "c2")], 1, 1));
    const tile = document.querySelector('.side-field [data-instance-id="c1"]')!;
    act(() => tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    act(() => void vi.setSystemTime(Date.now() + 1000));
    act(() => tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(sent).toEqual([]);
    expect(document.querySelector(".field-bar-count")?.textContent).toBe("Choose 1");
  });
  it("a double click on a board card while the pop-up grid shows answers once and opens no inspect (#1287)", () => {
    // One option is in the trash, so the grid is used; the other is a field card that can also be clicked on the board.
    const trash: ChoiceOptionView = { id: "o9", defId: "ST01-003", zone: "trash", ownerSeat: 0, eligible: true };
    const sent = mount(choice([onField("o1", "c1"), trash], 1, 1));
    expect(document.querySelector(".choice-grid")).not.toBeNull();
    doubleClick(document.querySelector('.side-field [data-instance-id="c1"]')!);
    expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o1"] }]);
    expect(inspectOpen()).toBe(false);
  });

  it("a double click on a DON!! card of the grid under One-tap actions still sends only one answer (#1287)", () => {
    updateSettings({ oneTapActions: true });
    try {
      const don = (id: string): ChoiceOptionView => ({ id, defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Karoo", rested: false });
      const sent = mount(choice([don("d1"), don("d2")], 1, 1));
      expect(document.querySelector(".choice-grid")).not.toBeNull();
      doubleClick(document.querySelectorAll(".choice-don-card")[0]!);
      expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["d1"] }]);
    } finally {
      updateSettings({ oneTapActions: false });
    }
  });

  it("a double click on a field bar target under One-tap actions still sends only one answer (#1287)", () => {
    updateSettings({ oneTapActions: true });
    try {
      const sent = mount(choice([onField("o1", "c1"), onField("o2", "c2")], 1, 1));
      doubleClick(document.querySelector('.side-field [data-instance-id="c1"]')!);
      expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o1"] }]);
    } finally {
      updateSettings({ oneTapActions: false });
    }
  });

  it("a double click on a searched card picks it, and answers once the picks reach the minimum, like Confirm (#1287)", () => {
    const look = (id: string): ChoiceOptionView => ({ id, defId: "ST01-003", zone: "deck", ownerSeat: 0, eligible: true });
    const pendingLook = {
      id: "p2", seat: 0, kind: "effect", cardDefId: "ST01-004", optional: false, prompt: "Look.",
      request: { type: "look", options: [look("o0"), look("o1"), look("o2")], minSelect: 2, maxSelect: 2, groups: [{ label: "Take 2", max: 2, eligibleIds: ["o0", "o1", "o2"] }], rest: "deck_bottom", restLabel: "rest on the bottom" },
    } as unknown as PendingChoiceView;
    const sent = mount(pendingLook);
    const tiles = () => document.querySelectorAll(".choice-option .card-tile");
    doubleClick(tiles()[0]!);
    expect(sent).toEqual([]);
    expect(document.querySelectorAll(".choice-option.selected")).toHaveLength(1);
    doubleClick(tiles()[2]!);
    expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0", "o2"], orderedOptionIds: ["o1"] }]);
  });
});
