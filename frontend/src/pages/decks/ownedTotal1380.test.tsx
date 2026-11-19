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

const ALT = { product_id: 7, name: "Alt", market_price: null, low_price: null, image_url: "alt.jpg", tcgplayer_url: "", group_name: "", is_special: true, owned: 1 };

async function render(cards: CardView[], editable: boolean, showAltArts = true) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CardTable
            cards={cards}
            onOwnedSaved={() => {}}
            onAltOwnedChange={editable ? () => {} : undefined}
            showAltArts={showAltArts}
            layout="list"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  return host.querySelector(".desktop-table")!;
}

describe("deck Owned column with alt tiles (#1380)", () => {
  it("a card whose editable alt tiles are shown gets the read-only total, other cards keep the stepper (#1380)", async () => {
    const table = await render([card("OP01-016", 2, { owned: 1, alts_owned: 2, alt_arts: [ALT] }), card("OP01-025", 2, { owned: 1 })], true);
    const alts = table.querySelector('tr[data-card-id="OP01-016"]')!;
    expect(alts.querySelector(".owned-total")?.textContent).toBe("3");
    expect(alts.querySelector("td input.owned")).toBeNull();
    const plain = table.querySelector('tr[data-card-id="OP01-025"]')!;
    expect(plain.querySelector(".owned-total")).toBeNull();
    expect(plain.querySelector("input.owned")).not.toBeNull();
  });

  it("without an alt-owned handler (read-only deck) the Owned column keeps its stepper and alt note (#1380)", async () => {
    const table = await render([card("OP01-016", 2, { owned: 1, alts_owned: 2, alt_arts: [ALT] })], false);
    const row = table.querySelector('tr[data-card-id="OP01-016"]')!;
    expect(row.querySelector(".owned-total")).toBeNull();
    expect(row.querySelector("td > input.owned, td .owned-wrap input.owned")).not.toBeNull();
    expect(row.querySelector(".alts-owned-note")?.textContent).toBe("+2 alt · 3 total");
  });
});
