// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CollectorLine, ShoppingItem } from "../../api";
import { shoppingLeftCost, shoppingRowAmount } from "../collection/collectorLines";
import { shoppingMenuPrice } from "./deckCost";
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

describe("Master Shopping main row price leaves out Extra copies (#1187)", () => {
  it("Master Shopping main row price leaves out Extra copies shown on their own rows (#1187)", () => {
    expect(shoppingLeftCost(item())).toBe(2.5);
    expect(shoppingLeftCost(item({ collector_wants: [line(), line({ product_id: 203, remaining_cost: 12.34 })] }))).toBe(2.5);
    expect(shoppingLeftCost(item({ still_need: 0, remaining_cost: 0 }))).toBe(0);
  });

  it("an unpriced deck part is null while copies are needed, and 0 once the decks are covered (#1187)", () => {
    expect(shoppingLeftCost(item({ remaining_cost: null }))).toBeNull();
    expect(shoppingLeftCost(item({ remaining_cost: null, still_need: 0 }))).toBe(0);
  });

  it("the Remaining column sorts by the deck part plus Extra copies still to buy (#1211)", () => {
    expect(shoppingColumnValue(item({ collector_wants: [] }), "remaining")).toBe(2.5);
    expect(shoppingColumnValue(item({ collector_wants: [line()] }), "remaining")).toBe(32.5);
    expect(shoppingColumnValue(item({ still_need: 0, remaining_cost: 0, collector_wants: [line()] }), "remaining")).toBe(30);
    expect(shoppingColumnValue(item({ collector_wants: [line({ still_need: 0, have: 1, remaining_cost: 0 })] }), "remaining")).toBe(2.5);
  });

  it("the Sort menu's Price puts a covered card with a pricey Extra copy first (#1211)", () => {
    const gold = item({ card_id: "EB05-055", still_need: 0, remaining_cost: 0, market_price: 4, collector_wants: [line({ remaining_cost: 1530 })] });
    const plain = item({ card_id: "EB01-003", still_need: 2, remaining_cost: 20, market_price: 10, collector_wants: [] });
    const covered = item({ card_id: "EB01-004", still_need: 0, remaining_cost: 0, market_price: 7, collector_wants: [] });
    expect(shoppingMenuPrice(gold)).toBe(1530);
    expect(shoppingMenuPrice(plain)).toBe(20);
    expect(shoppingMenuPrice(covered)).toBe(7); // nothing left to buy: the shown market price, as before
    const sorted = [plain, covered, gold].sort((a, b) => (shoppingMenuPrice(b) ?? 0) - (shoppingMenuPrice(a) ?? 0));
    expect(sorted.map((i) => i.card_id)).toEqual(["EB05-055", "EB01-003", "EB01-004"]);
  });

  it("a card with a deck part and an Extra copy still shows only the deck part (#1187)", () => {
    const host = view([item()]);
    const trigger = host.querySelector("tr.need td button[data-buy-split]")!;
    expect(trigger.querySelector(".buy-split-amount")?.textContent).toContain("$2.50");
    expect(trigger.querySelector(".buy-split-amount")?.textContent).not.toContain("32.50");
  });

  it("a covered card with an Extra copy to buy shows the Extra copy total on its main row (#1214)", () => {
    expect(shoppingRowAmount(item({ still_need: 0, remaining_cost: 0, collector_wants: [line({ remaining_cost: 1000 }), line({ product_id: 203, remaining_cost: 530 })] }))).toBe(1530);
    const covered = view([item({ card_id: "EB05-055", still_need: 0, remaining_cost: 0, collector_wants: [line({ remaining_cost: 1530 })] })]);
    const btn = covered.querySelector("button[data-buy-split]")!;
    expect(btn.querySelector(".buy-split-amount")?.textContent).toContain("$1530.00");
    expect(btn.querySelector(".buy-split-action")?.textContent).toBe("★ Extra copy");
  });

  it("a card with a deck part above zero never adds its Extra copies to the main row (#1214)", () => {
    expect(shoppingRowAmount(item())).toBe(2.5);
    expect(shoppingRowAmount(item({ still_need: 1, remaining_cost: 1.25, collector_wants: [line({ remaining_cost: 1530 })] }))).toBe(1.25);
  });

  it("a covered card whose Extra copy is already owned shows $0.00 (#1214)", () => {
    const owned = line({ have: 1, still_need: 0, remaining_cost: 0 });
    expect(shoppingRowAmount(item({ still_need: 0, remaining_cost: 0, collector_wants: [owned] }))).toBe(0);
    const host = view([item({ card_id: "EB01-003", still_need: 0, remaining_cost: 0, collector_wants: [owned] })]);
    expect(host.querySelector("button[data-buy-split] .buy-split-amount")?.textContent).toContain("$0.00");
  });
});
