// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CollectorLine, ShoppingItem } from "../../api";
import { shoppingLeftCost } from "../collection/collectorLines";
import { ShoppingItemsView, shoppingColumnValue } from "./ShoppingItemsView";

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

const line = (over: Partial<CollectorLine> = {}): CollectorLine => ({
  product_id: 202,
  label: "Gold-stamped",
  image_url: null,
  market_price: 30,
  want: 1,
  have: 0,
  still_need: 1,
  remaining_cost: 30,
  ...over,
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
    alt_arts: [
      { product_id: 202, name: "Gold-stamped", market_price: 30, low_price: null, image_url: "", tcgplayer_url: "", group_name: "", is_special: true, owned: 0, wanted: 0 },
    ],
    collector_wants: [line()],
    ...over,
  }) as ShoppingItem;

function view(items: ShoppingItem[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ShoppingItemsView
          items={items}
          layout="list"
          isNarrow={false}
          selectedCardIds={new Set()}
          onToggleCard={() => {}}
          allVisibleSelected={false}
          onToggleSelectVisible={() => {}}
          showAltArts={false}
          altRow={() => null}
          usedInNote={() => ""}
          onOwnedSaved={() => {}}
          onRemoveExtra={() => {}}
          removingExtraId={null}
          onBuyPick={() => {}}
          collector={{ onChange: () => {}, onRemove: () => {}, busyKey: null, onlyNeed: false }}
        />
      </QueryClientProvider>,
    ),
  );
  return host;
}

describe("Master Shopping price left counts collector copies (#1167)", () => {
  it("the left price adds the collector lines still to buy to the decks' remaining cost (#1167)", () => {
    expect(shoppingLeftCost(item())).toBe(32.5);
    expect(shoppingLeftCost(item({ collector_wants: [line(), line({ product_id: 203, remaining_cost: 12.34 })] }))).toBe(44.84);
  });

  it("a collector line that is already covered adds nothing (#1167)", () => {
    const covered = line({ have: 1, still_need: 0, remaining_cost: 0 });
    expect(shoppingLeftCost(item({ collector_wants: [covered] }))).toBe(2.5);
    expect(shoppingLeftCost(item({ collector_wants: undefined }))).toBe(2.5);
  });

  it("an unpriced deck part is null while copies are needed, and 0 once the decks are covered (#1167)", () => {
    expect(shoppingLeftCost(item({ remaining_cost: null }))).toBeNull();
    expect(shoppingLeftCost(item({ remaining_cost: null, still_need: 0 }))).toBe(30);
  });

  it("the Remaining column sorts by the same number the price shows (#1167)", () => {
    expect(shoppingColumnValue(item(), "remaining")).toBe(32.5);
  });

  it("the table price shows deck plus collector, and a covered card still shows the collector amount on a button (#1167)", () => {
    const host = view([item()]);
    const trigger = host.querySelector("tr.need td button[data-buy-split]")!;
    expect(trigger.querySelector(".buy-split-amount")?.textContent).toContain("$32.50");
    const covered = view([item({ card_id: "EB01-003", still_need: 0, remaining_cost: 0 })]);
    const btn = covered.querySelector("button[data-buy-split]")!;
    expect(btn.querySelector(".buy-split-amount")?.textContent).toContain("$30.00");
    expect(btn.querySelector(".buy-split-action")?.textContent).toBe("★ Collector copy");
  });
});
