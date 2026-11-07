// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { CatalogCardResult } from "./api";

const { setAltOwned, setOwned } = vi.hoisted(() => ({
  setAltOwned: vi.fn(async (..._args: unknown[]) => ({ card_id: "OP01-016", product_id: 700002, qty: 1 })),
  setOwned: vi.fn(async (..._args: unknown[]) => ({})),
}));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  api: { setAltOwned, setOwned },
}));

import { CollectionAltControl } from "./pages/collection/CollectionAddPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const altRow = (owned: number): CatalogCardResult => ({
  card_id: "OP01-016",
  name: "Nami (Manga)",
  rarity: "SR",
  color: "Red",
  card_type: "Character",
  cost: 1,
  market_price: 50,
  low_price: 40,
  image_url: "",
  tcgplayer_url: "",
  group_name: "Romance Dawn",
  alt_product_id: 700002,
  owned,
});

function render(card: CatalogCardResult) {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <QueryClientProvider client={new QueryClient()}>
        <CollectionAltControl card={card} onSaved={() => {}} />
      </QueryClientProvider>,
    );
  });
  return host;
}

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("Collection alt-art search row", () => {
  it("Add saves that alt printing, not the base card (#848)", async () => {
    setAltOwned.mockClear();
    setOwned.mockClear();
    const host = render(altRow(0));
    await click(host.querySelector('button[aria-label="Add Nami (Manga) alt art to collection"]')!);
    expect(setAltOwned).toHaveBeenCalledWith("OP01-016", 700002, 1);
    expect(setOwned).not.toHaveBeenCalled();
  });

  it("an owned alt steps its own copy count (#848)", async () => {
    setAltOwned.mockClear();
    const host = render(altRow(2));
    await click(host.querySelector('button[aria-label="Increase owned for OP01-016 alt art"]')!);
    expect(setAltOwned).toHaveBeenCalledWith("OP01-016", 700002, 3);
  });
});
