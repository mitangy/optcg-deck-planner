// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "./CollectionPage";
import { OWNED_SORTS_KEY } from "../../storage/keys";

const h = vi.hoisted(() => ({ owned: {} as Record<string, number> }));

const card = (card_id: string, value: number) => ({
  card_id,
  name: card_id,
  rarity: "R",
  color: "Red",
  card_type: "Character",
  cost: 2,
  owned: h.owned[card_id] ?? 0,
  market_price: 1,
  low_price: null,
  value,
  image_url: "",
  tcgplayer_url: "",
  used_in: [],
  alt_arts: [],
});

vi.mock("../../api", async (orig) => {
  const real = await orig<typeof import("../../api")>();
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => {
      if (name === "decks") return async () => [];
      if (name === "ownedCollection")
        return async () => ({
          items: [card("OP01-001", 1), card("OP01-002", 50)],
          unique_cards: 2,
          total_copies: 4,
          total_value: 51,
          unpriced_cards: 0,
        });
      if (name === "setOwned") return async (card_id: string, qty: number) => ({ card_id, qty });
      return () => new Promise(() => {});
    },
  });
  return { ...real, api };
});

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
  h.owned = { "OP01-001": 2, "OP01-002": 2 };
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))));
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const order = () => [...host.querySelectorAll("tr[data-row-id]")].map((e) => (e as HTMLElement).dataset.rowId);

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CollectionPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
  await flush();
}

describe("Collection (#1498)", () => {
  it("opens in set order, not by value (#1498)", async () => {
    await mount();
    // The cheaper card is first: by value the 50-dollar card would lead.
    expect(order()).toEqual(["OP01-001", "OP01-002"]);
  });

  it("a card stepped down keeps its place in an Owned-sorted list until the pointer has gone (#1498)", async () => {
    localStorage.setItem(OWNED_SORTS_KEY, JSON.stringify(["owned"]));
    await mount();
    expect(order()).toEqual(["OP01-001", "OP01-002"]);
    const row = host.querySelector('tr[data-row-id="OP01-001"]') as HTMLElement;
    act(() => void row.dispatchEvent(Object.assign(new Event("pointerover", { bubbles: true }), {})));
    await act(async () => (row.querySelector('button[aria-label="Decrease owned"]') as HTMLElement).click());
    await flush();
    // One copy fewer sorts it below the other card, but it stays under the pointer.
    expect(order()).toEqual(["OP01-001", "OP01-002"]);
    act(() => void row.dispatchEvent(Object.assign(new Event("pointerout", { bubbles: true }), { relatedTarget: document.body })));
    advance(700);
    expect(order()).toEqual(["OP01-002", "OP01-001"]);
  });
});
