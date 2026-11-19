// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ShoppingItem } from "../../api";
import { ShoppingItemsView } from "./ShoppingItemsView";

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
    alt_arts: [
      { product_id: 202, name: "Gold-stamped", market_price: 30, low_price: null, image_url: "", tcgplayer_url: "", group_name: "", is_special: true, owned: 0, wanted: 0 },
    ],
    alts_owned: 2,
    ...over,
  }) as ShoppingItem;

function view(items: ShoppingItem[], showAltArts: boolean) {
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
          showAltArts={showAltArts}
          altRow={() => <div className="alt-art-stub" />}
         
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

describe("the Owned column shows the total when the art tiles carry the steppers (#1379)", () => {
  it("a card with alt tiles shows the read-only total and base/alt counts, no stepper in its Owned cell (#1379)", () => {
    const host = view([item()], true);
    expect(host.querySelector(".desktop-table .owned-total")?.textContent).toBe("4");
    expect(host.querySelector(".desktop-table .alts-owned-note")?.textContent).toBe("2 base · 2 alts");
    expect(host.querySelector(".desktop-table input.owned")).toBeNull();
  });

  it("with alt arts off or a card without alt arts the Owned cell keeps the base stepper (#1379)", () => {
    const off = view([item()], false);
    expect(off.querySelector(".desktop-table input.owned")).not.toBeNull();
    expect(off.querySelector(".desktop-table .owned-total")).toBeNull();
    const none = view([item({ alt_arts: [], alts_owned: 0 })], true);
    expect(none.querySelector(".desktop-table input.owned")).not.toBeNull();
    expect(none.querySelector(".desktop-table .owned-total")).toBeNull();
  });
});
