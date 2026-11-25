// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CatalogCardResult } from "../../api";
import { PRICE_CHECK_RECENTS_KEY, SHOW_ALT_ARTS_KEY } from "../../storage/keys";
import { CATALOG_SEARCH_DEBOUNCE_MS } from "../../hooks/useCatalogSearch";
import { PriceCheck } from "./PriceCheck";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const card = (card_id: string, product_id: number, extra: Partial<CatalogCardResult> = {}): CatalogCardResult => ({
  card_id,
  name: `Card ${card_id}`,
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
const ALPHA = card("OP01-001", 11);
const BETA = card("OP01-002", 12);
const ALPHA_ALT = card("OP01-001", 13, { alt_product_id: 13, name: "Card OP01-001 (Parallel)" });

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

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() =>
    root!.render(
      <QueryClientProvider client={client}>
        <input id="elsewhere" />
        <PriceCheck />
      </QueryClientProvider>,
    ),
  );
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(CATALOG_SEARCH_DEBOUNCE_MS + 50));
const dialog = () => document.querySelector('[role="dialog"]');
const press = (target: Element | Window, key: string) =>
  act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

function openDialog() {
  act(() => document.querySelector<HTMLButtonElement>(".price-check-trigger")!.click());
}

async function typeQuery(text: string) {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
  await flush();
}

const rowFor = (c: CatalogCardResult) =>
  [...document.querySelectorAll(".price-check-row")].find((r) => r.textContent?.includes(c.name))!;
const storedIds = () => (JSON.parse(localStorage.getItem(PRICE_CHECK_RECENTS_KEY) ?? "[]") as CatalogCardResult[]).map((c) => `${c.card_id}:${c.product_id}`);

describe("Price check (#1469)", () => {
  it("asks for alt art rows even when Show alt arts is switched off (#1469)", async () => {
    localStorage.setItem(SHOW_ALT_ARTS_KEY, "0");
    const search = vi.spyOn(api, "searchCatalog").mockResolvedValue([ALPHA, ALPHA_ALT]);
    mount();
    openDialog();
    await typeQuery("OP01-001");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toMatchObject({ q: "OP01-001", alts: true });
    expect(document.querySelectorAll(".price-check-row")).toHaveLength(2);
  });

  it("tapping a price or a thumb files the card under Recent lookups, newest first, once per art (#1469)", async () => {
    vi.spyOn(api, "searchCatalog").mockResolvedValue([ALPHA, BETA, ALPHA_ALT]);
    mount();
    openDialog();
    await typeQuery("OP01");
    expect(storedIds()).toEqual([]);

    await act(async () => rowFor(ALPHA).querySelector<HTMLButtonElement>(".market-price-btn")!.click());
    await act(async () => rowFor(BETA).querySelector<HTMLButtonElement>(".thumb-btn")!.click());
    expect(storedIds()).toEqual(["OP01-002:12", "OP01-001:11"]);

    // Looking at the first card again moves it to the front instead of listing it twice; its alt art is a separate entry.
    await act(async () => rowFor(ALPHA).querySelector<HTMLButtonElement>(".market-price-btn")!.click());
    await act(async () => rowFor(ALPHA_ALT).querySelector<HTMLButtonElement>(".market-price-btn")!.click());
    expect(storedIds()).toEqual(["OP01-001:13", "OP01-001:11", "OP01-002:12"]);
  });

  it("lists the stored lookups when opened with nothing typed, and keeps the newest eight (#1469)", async () => {
    const many = Array.from({ length: 10 }, (_, i) => card(`OP02-0${i}0`, 100 + i));
    vi.spyOn(api, "searchCatalog").mockResolvedValue(many);
    mount();
    openDialog();
    await typeQuery("OP02");
    for (const c of many) await act(async () => rowFor(c).querySelector<HTMLButtonElement>(".market-price-btn")!.click());
    expect(storedIds()).toHaveLength(8);
    expect(storedIds()[0]).toBe("OP02-090:109");

    act(() => document.querySelector<HTMLButtonElement>('[role="dialog"] .price-check-close')!.click());
    expect(dialog()).toBeNull();
    openDialog();
    const names = [...document.querySelectorAll(".price-check-name")].map((n) => n.textContent);
    expect(names[0]).toBe("Card OP02-090");
    expect(names).toHaveLength(8);
  });

  it("opens on / unless the key was typed into a field (#1469)", () => {
    mount();
    const elsewhere = document.getElementById("elsewhere")!;
    press(elsewhere, "/");
    expect(dialog()).toBeNull();

    press(document.body, "/");
    expect(dialog()).not.toBeNull();
  });
});
