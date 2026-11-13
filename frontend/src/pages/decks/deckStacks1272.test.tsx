// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CardView } from "../../api";
import { CardTable } from "./CardTable";

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

function card(card_id: string, needed: number, over: Partial<CardView> = {}): CardView {
  return {
    card_id,
    name: card_id,
    rarity: "C",
    color: "Red",
    card_type: "CHARACTER",
    cost: 2,
    needed,
    owned: 0,
    still_need: needed,
    market_price: 1,
    low_price: 1,
    image_url: `https://tcgplayer-cdn.tcgplayer.com/product/${card_id.replace(/\D/g, "")}_200w.jpg`,
    tcgplayer_url: "",
    section: "main",
    alt_arts: [],
    ...over,
  };
}

const CARDS = [
  card("OP01-016", 4),
  card("OP01-025", 2),
  card("OP01-013", 1),
  card("OP01-075", 6),
  card("DON-001", 10, { section: "don", card_type: "DON!!" }),
];

function layersByCard(scope: string, tile: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const el of host!.querySelectorAll(`${scope} ${tile}`)) {
    const id = el.getAttribute("data-card-id")!;
    out[id] = el.querySelector(".card-stack") ? el.querySelectorAll(".card-stack-copy").length : null;
  }
  return out;
}

describe("deck page card stacks (#1272)", () => {
  it("grid, table and phone list draw one layer per extra copy in the deck, and none for DON!! (#1272)", async () => {
    const expected = { "OP01-016": 3, "OP01-025": 1, "OP01-013": 0, "OP01-075": 3, "DON-001": null };
    for (const layout of ["grid", "list"] as const) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
      await act(async () =>
        root!.render(
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
              <CardTable cards={CARDS} onOwnedSaved={() => {}} showAltArts={false} layout={layout} />
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      );
      if (layout === "grid") {
        expect(layersByCard(".card-grid", ".grid-card")).toEqual(expected);
      } else {
        expect(layersByCard(".desktop-table", "tr[data-card-id]")).toEqual(expected);
        expect(layersByCard(".mobile-card-list", ".mobile-card")).toEqual(expected);
      }
      // Only the front card opens the lightbox: the layers hold no buttons.
      expect(host.querySelectorAll(".card-stack-copy button")).toHaveLength(0);
      act(() => root!.unmount());
      host.remove();
      root = null;
      host = null;
    }
  });
});
