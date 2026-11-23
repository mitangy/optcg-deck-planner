// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ShoppingItem } from "../../api";
import { ShoppingItemsView } from "./ShoppingItemsView";
import { shownWhileOnlyNeed } from "./GroupBuyChip";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
});

const roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots.length = 0;
  document.body.innerHTML = "";
});

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem =>
  ({
    card_id: "EB01-002",
    name: "Izo",
    rarity: "R",
    color: "Red",
    card_type: "Character",
    cost: 2,
    need: 4,
    owned: 2,
    still_need: 2,
    market_price: 1.25,
    low_price: null,
    remaining_cost: 2.5,
    image_url: "",
    tcgplayer_url: "",
    used_in: ["Deck A"],
    alt_arts: [],
    ...over,
  }) as ShoppingItem;

function view(items: ShoppingItem[], showAltArts = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <ShoppingItemsView
          items={items}
          layout="list"
          isNarrow={false}
          selectedCardIds={new Set()}
          onToggleCard={() => {}}
          allVisibleSelected={false}
          onToggleSelectVisible={() => {}}
          showAltArts={showAltArts}
          altRow={() => <div className="alt-art-stub" />}
         
          onOwnedSaved={() => {}}
          onRemoveExtra={() => {}}
          removingExtraId={null}
          onBuyPick={() => {}}
          collector={{ onChange: () => {}, onRemove: () => {}, busyKey: null, onlyNeed: false }}
        />
      </QueryClientProvider></MemoryRouter>,
    ),
  );
  return host;
}

describe("Shopping shows copies still coming from a group buy (#1418)", () => {
  it("a locked buy shows In group buy with the copies and links to it, on the table and phone list (#1418)", () => {
    const host = view([item({ in_group_buy: 3, group_buys: [{ group_buy_id: 42, title: "Spring", qty: 3, ordered: false }] })]);
    const chips = [...host.querySelectorAll<HTMLAnchorElement>(".gb-transit-chip")];
    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const chip of chips) {
      expect(chip.textContent).toBe("In group buy \u00b7 3");
      expect(chip.getAttribute("href")).toBe("/group-buys/42");
    }
  });

  it("an ordered buy says On the way, and a card in no buy has no chip (#1418)", () => {
    const host = view([
      item({ in_group_buy: 2, group_buys: [{ group_buy_id: 7, title: "Autumn", qty: 2, ordered: true }] }),
      item({ card_id: "OP01-001", name: "Luffy" }),
    ]);
    const texts = [...host.querySelectorAll(".gb-transit-chip")].map((c) => c.textContent);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(texts)).toEqual(new Set(["On the way \u00b7 2"]));
  });

  it("only-need keeps a fully covered card that is in a group buy and drops one that is not (#1418)", () => {
    const covered = item({ still_need: 0, in_group_buy: 2, group_buys: [{ group_buy_id: 1, title: "A", qty: 2, ordered: false }] });
    expect(shownWhileOnlyNeed(covered)).toBe(true);
    expect(shownWhileOnlyNeed(item({ still_need: 0 }))).toBe(false);
  });
});
