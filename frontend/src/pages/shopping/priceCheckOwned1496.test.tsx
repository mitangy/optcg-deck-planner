// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CatalogCardResult, type OwnedCollectionResponse } from "../../api";
import { PRICE_CHECK_RECENTS_KEY } from "../../storage/keys";
import { CATALOG_SEARCH_DEBOUNCE_MS } from "../../hooks/useCatalogSearch";
import { PriceCheck } from "./PriceCheck";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const card = (card_id: string, product_id: number, extra: Partial<CatalogCardResult> = {}): CatalogCardResult => ({
  card_id,
  name: `Card ${card_id}${extra.alt_product_id ? " (Parallel)" : ""}`,
  rarity: "R",
  color: "Red",
  card_type: "Character",
  cost: 2,
  market_price: 4.5,
  low_price: 3.9,
  image_url: `https://img.test/${product_id}.jpg`,
  tcgplayer_url: "",
  group_name: "Set",
  product_id,
  ...extra,
});
const BASE = card("OP01-001", 11);
const NEW_CARD = card("OP01-002", 12);
const ALT = card("OP01-001", 13, { alt_product_id: 13 });

const collection = (): OwnedCollectionResponse =>
  ({
    items: [
      {
        card_id: "OP01-001",
        owned: 4,
        alts_owned: 2,
        alt_arts: [{ product_id: 13, owned: 2 }],
      },
    ],
    unique_cards: 1,
    total_copies: 6,
    total_value: 0,
    unpriced_cards: 0,
  }) as unknown as OwnedCollectionResponse;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(api, "recentSales").mockResolvedValue({ product_id: 11, sales: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.innerHTML = "";
});

async function openWithRecents(recents: CatalogCardResult[]) {
  localStorage.setItem(PRICE_CHECK_RECENTS_KEY, JSON.stringify(recents));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <PriceCheck />
      </QueryClientProvider>,
    ),
  );
  await act(async () => document.querySelector<HTMLButtonElement>(".price-check-trigger")!.click());
  await act(() => vi.advanceTimersByTimeAsync(CATALOG_SEARCH_DEBOUNCE_MS + 50));
}

const rowFor = (c: CatalogCardResult) =>
  [...document.querySelectorAll(".price-check-row")].find((r) => r.textContent?.includes(c.name))!;
const btn = (row: Element, label: RegExp) =>
  [...row.querySelectorAll<HTMLButtonElement>(".price-check-owned button")].find((b) => label.test(b.getAttribute("aria-label") ?? ""))!;

describe("Price check owned control (#1496)", () => {
  it("a recent lookup shows the live owned count, not the one stored with it (#1496)", async () => {
    vi.spyOn(api, "ownedCollection").mockResolvedValue(collection());
    await openWithRecents([{ ...BASE, owned: 9 }, { ...ALT, owned: 9 }]);
    expect(rowFor(BASE).querySelector(".price-check-owned input.owned")).toHaveProperty("value", "4");
    expect(rowFor(ALT).querySelector(".price-check-owned .deck-editor-qty")!.textContent).toBe("2");
  });

  it("a card you do not own shows Add, and Add sets one copy of the base card (#1496)", async () => {
    vi.spyOn(api, "ownedCollection").mockResolvedValue(collection());
    const setOwned = vi.spyOn(api, "setOwned").mockResolvedValue({ card_id: "OP01-002", qty: 1 } as never);
    await openWithRecents([NEW_CARD]);
    await act(async () => btn(rowFor(NEW_CARD), /^Add OP01-002/).click());
    expect(setOwned).toHaveBeenCalledWith("OP01-002", 1);
  });

  it("an alt art you own steppers that alt's count, not the base card's (#1496)", async () => {
    vi.spyOn(api, "ownedCollection").mockResolvedValue(collection());
    const setAlt = vi.spyOn(api, "setAltOwned").mockResolvedValue({ qty: 3 } as never);
    await openWithRecents([ALT]);
    await act(async () => btn(rowFor(ALT), /^Increase owned/).click());
    expect(setAlt).toHaveBeenCalledWith("OP01-001", 13, 3);
  });

  it("an alt art you do not own adds that alt, not the base card (#1496)", async () => {
    const other = card("OP01-002", 15, { alt_product_id: 15 });
    vi.spyOn(api, "ownedCollection").mockResolvedValue(collection());
    const setAlt = vi.spyOn(api, "setAltOwned").mockResolvedValue({ qty: 1 } as never);
    const setOwned = vi.spyOn(api, "setOwned");
    await openWithRecents([other]);
    await act(async () => btn(rowFor(other), /^Add /).click());
    expect(setAlt).toHaveBeenCalledWith("OP01-002", 15, 1);
    expect(setOwned).not.toHaveBeenCalled();
  });

  it("Add stays disabled until the owned collection has loaded, so it cannot overwrite a saved count (#1496)", async () => {
    vi.spyOn(api, "ownedCollection").mockReturnValue(new Promise(() => {}));
    const setOwned = vi.spyOn(api, "setOwned");
    await openWithRecents([BASE]);
    const add = btn(rowFor(BASE), /^Add /);
    expect(add.disabled).toBe(true);
    await act(async () => add.click());
    expect(setOwned).not.toHaveBeenCalled();
  });

  it("using the owned control does not file the card under Recent lookups (#1496)", async () => {
    vi.spyOn(api, "ownedCollection").mockResolvedValue(collection());
    vi.spyOn(api, "setOwned").mockResolvedValue({ card_id: "OP01-002", qty: 1 } as never);
    await openWithRecents([BASE, NEW_CARD]);
    await act(async () => btn(rowFor(NEW_CARD), /^Add /).click());
    const ids = (JSON.parse(localStorage.getItem(PRICE_CHECK_RECENTS_KEY)!) as CatalogCardResult[]).map((c) => c.card_id);
    expect(ids).toEqual(["OP01-001", "OP01-002"]);
  });
});
