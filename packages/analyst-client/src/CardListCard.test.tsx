// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CardListCard } from "./CardListCard";
import { parseCardList } from "./cardLists";
import { SourceHooksContext, type SourceHooks } from "./Sources";
import type { DeckEditOp, DeckEditor } from "./proposals";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const row = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, type: "character", colors: ["red"], cost: 4, power: 5000, reason: "", ...over });
const list = parseCardList({
  id: "l1",
  kind: "card_list",
  title: "Red Straw Hats",
  leader_id: "OP01-001",
  cards: [
    row("OP01-022", "Brook", { counter: 1000, reason: "-2000 power when attacking" }),
    row("OP01-028", "Green Star Rafflesia", { type: "event", cost: 1, power: undefined }),
    row("OP01-075", "Pacifista", { any_number: true }),
    row("OP01-001", "Roronoa Zoro", { type: "leader" }),
  ],
})!;

const editor = (cards: { id: string; copies: number }[], apply: (ops: DeckEditOp[]) => Promise<void>, leaderId: string | null = "OP01-001"): DeckEditor => ({ ref: "planner:1", leaderId, cards, apply });
const text = () => host!.textContent ?? "";
const btn = (label: string) => host!.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

async function render(ed: DeckEditor | null, hooks: SourceHooks = {}) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () =>
    root!.render(
      <SourceHooksContext.Provider value={hooks}>
        <CardListCard list={list} editor={ed} />
      </SourceHooksContext.Provider>,
    ),
  );
}

describe("CardListCard (#1450)", () => {
  it("shows the title, each card's stats and why it fits, with art from the app (#1450)", async () => {
    await render(null, { card: (id) => ({ name: `Art ${id}`, imageUrl: `https://img.test/${id}.jpg` }) });
    expect(text()).toContain("Red Straw Hats");
    expect(text()).toContain("Art OP01-022");
    expect([...host!.querySelectorAll(".lp-cl-stats")].map((e) => e.textContent)).toEqual([
      "Character · Red · cost 4 · power 5000 · counter +1000",
      "Event · Red · cost 1",
      "Character · Red · cost 4 · power 5000",
      "Leader · Red · cost 4 · power 5000",
    ]);
    expect(text()).toContain("-2000 power when attacking");
    expect([...host!.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toContain("https://img.test/OP01-022.jpg");
  });

  it("with no deck open shows the cards without buttons and says to open a deck (#1450)", async () => {
    await render(null);
    expect(host!.querySelectorAll("button")).toHaveLength(0);
    expect(text()).toContain("Open a deck to add these cards.");
  });

  it("a card list made for another leader cannot add to the open deck (#1462)", async () => {
    const apply = vi.fn(async () => {});
    await render(editor([{ id: "OP01-022", copies: 2 }], apply, "OP02-001"));
    expect(host!.querySelectorAll(".lp-cl-step")).toHaveLength(0);
    expect(host!.querySelectorAll("button")).toHaveLength(0);
    expect(text()).toContain("Made for another deck");
    expect(text()).toContain("Brook");
  });

  it("compares the leader ignoring case, and a deck with no leader gets no steppers (#1462)", async () => {
    await render(editor([], vi.fn(async () => {}), "op01-001"));
    expect(btn("Add one Brook")).not.toBeNull();
    await render(editor([], vi.fn(async () => {}), null));
    expect(btn("Add one Brook")).toBeNull();
  });

  it("a list with no leader cannot add to any deck and says to ask from the deck (#1462)", async () => {
    const noLeader = parseCardList({ id: "l2", kind: "card_list", title: "Any", cards: [row("OP01-022", "Brook")] })!;
    await act(async () =>
      (host ? root! : (host = document.body.appendChild(document.createElement("div")), (root = createRoot(host)))).render(
        <SourceHooksContext.Provider value={{}}>
          <CardListCard list={noLeader} editor={editor([], vi.fn(async () => {}))} />
        </SourceHooksContext.Provider>,
      ),
    );
    expect(btn("Add one Brook")).toBeNull();
    expect(text()).toContain("Ask from this deck to add cards.");
  });

  it("adds one copy to the open deck with the count the deck has now (#1450)", async () => {
    const apply = vi.fn(async () => {});
    await render(editor([{ id: "OP01-022", copies: 2 }], apply));
    expect(text()).not.toContain("Open a deck");
    await act(async () => btn("Add one Brook")!.click());
    expect(apply).toHaveBeenCalledWith([{ id: "OP01-022", before: 2, after: 3 }]);
  });

  it("removes one copy, and only when the deck has one (#1450)", async () => {
    const apply = vi.fn(async () => {});
    await render(editor([{ id: "OP01-022", copies: 2 }], apply));
    expect(btn("Remove one Green Star Rafflesia")!.disabled).toBe(true);
    await act(async () => btn("Remove one Brook")!.click());
    expect(apply).toHaveBeenCalledWith([{ id: "OP01-022", before: 2, after: 1 }]);
  });

  it("disables Add at four copies, except for an any-number card (#1450)", async () => {
    await render(editor([{ id: "OP01-022", copies: 4 }, { id: "OP01-075", copies: 7 }], vi.fn(async () => {})));
    expect(btn("Add one Brook")!.disabled).toBe(true);
    expect(btn("Add one Pacifista")!.disabled).toBe(false);
  });

  it("gives a leader no buttons (#1450)", async () => {
    await render(editor([], vi.fn(async () => {})));
    expect(btn("Add one Roronoa Zoro")).toBeNull();
    expect(text()).toContain("Roronoa Zoro");
  });

  it("locks every button while one copy saves, and shows the error without changing the buttons (#1450)", async () => {
    let fail!: (e: Error) => void;
    const apply = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    await render(editor([], apply));
    await act(async () => btn("Add one Brook")!.click());
    expect(btn("Add one Brook")!.getAttribute("aria-busy")).toBe("true");
    expect(btn("Add one Green Star Rafflesia")!.disabled).toBe(true);
    await act(async () => btn("Add one Pacifista")!.click());
    expect(apply).toHaveBeenCalledTimes(1);
    const before = host!.querySelectorAll("button").length;
    await act(async () => fail(new Error("Couldn't save the deck.")));
    expect(text()).toContain("Couldn't save the deck.");
    expect(host!.querySelectorAll("button")).toHaveLength(before);
    expect(btn("Add one Brook")!.disabled).toBe(false);
  });

  it("card art is a button that enlarges that card when the app can show one (#1459)", async () => {
    const openCard = vi.fn();
    await render(null, { card: (id) => ({ name: `Art ${id}`, imageUrl: `https://img.test/${id}.jpg` }), openCard });
    const thumb = btn("Enlarge Art OP01-028")!;
    expect(thumb.querySelector("img")?.getAttribute("src")).toBe("https://img.test/OP01-028.jpg");
    act(() => thumb.click());
    expect(openCard).toHaveBeenCalledTimes(1);
    expect(openCard).toHaveBeenCalledWith("OP01-028");
  });

  it("card art is not a button when the app has no enlarged view (#1459)", async () => {
    await render(null, { card: (id) => ({ name: `Art ${id}`, imageUrl: `https://img.test/${id}.jpg` }) });
    expect(host!.querySelectorAll("button")).toHaveLength(0);
    expect(host!.querySelectorAll(".lp-cl-thumb img")).toHaveLength(4);
  });
});
