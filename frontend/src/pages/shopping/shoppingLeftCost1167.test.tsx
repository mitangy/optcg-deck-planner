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

  it("the Remaining column sorts by the deck part only (#1187)", () => {
    expect(shoppingColumnValue(item(), "remaining")).toBe(2.5);
  });

  it("the table price shows only the deck part, and a covered card shows $0.00 with the Extra copy hint (#1187)", () => {
    const host = view([item()]);
    const trigger = host.querySelector("tr.need td button[data-buy-split]")!;
    expect(trigger.querySelector(".buy-split-amount")?.textContent).toContain("$2.50");
    expect(trigger.querySelector(".buy-split-amount")?.textContent).not.toContain("32.50");
    const covered = view([item({ card_id: "EB01-003", still_need: 0, remaining_cost: 0 })]);
    const btn = covered.querySelector("button[data-buy-split]")!;
    expect(btn.querySelector(".buy-split-amount")?.textContent).not.toContain("$30");
    expect(btn.querySelector(".buy-split-action")?.textContent).toBe("★ Extra copy");
  });
});
