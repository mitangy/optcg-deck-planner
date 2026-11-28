// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ShoppingPage } from "./ShoppingPage";

const A = "OP01-001";
const B = "OP01-002";

const h = vi.hoisted(() => ({
  owned: {} as Record<string, number>,
  need: {} as Record<string, number>,
  setOwned: vi.fn(),
}));

function listFor() {
  const items = Object.keys(h.need).map((card_id) => {
    const owned = h.owned[card_id] ?? 0;
    const need = h.need[card_id];
    return {
      card_id,
      name: card_id === "OP01-001" ? "Roronoa Zoro" : "Nami",
      rarity: "R",
      color: "Red",
      card_type: "Character",
      cost: 2,
      need,
      owned,
      still_need: Math.max(0, need - owned),
      market_price: 1,
      low_price: null,
      remaining_cost: Math.max(0, need - owned),
      image_url: "",
      tcgplayer_url: "",
      used_in: ["Deck A"],
      alt_arts: [],
    };
  });
  return { items, cards_still_needed: 0, remaining_market: 0, unique_cards: items.length };
}

vi.mock("../../api", async (orig) => {
  const real = await orig<typeof import("../../api")>();
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => {
      if (name === "decks") return async () => [{ id: 1, name: "Deck A" }];
      if (name === "shopping") return async () => listFor();
      if (name === "setOwned") return h.setOwned;
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
  // Real time keeps ticking so the query client resolves; the 600 ms release is advanced by hand.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
  h.owned = { [A]: 1, [B]: 0 };
  h.need = { [A]: 2, [B]: 1 };
  h.setOwned.mockReset();
  h.setOwned.mockImplementation(async (card_id: string, qty: number) => {
    h.owned[card_id] = qty;
    return { card_id, qty };
  });
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))));
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ShoppingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
  await flush();
}

const tableRow = (id: string) => host.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement | null;
const pointer = (el: Element, type: string, init: Record<string, unknown> = {}) =>
  act(() => void el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), init)));

async function cover(id: string) {
  const row = tableRow(id)!;
  pointer(row, "pointerover");
  await act(async () => (row.querySelector('button[aria-label="Increase owned"]') as HTMLElement).click());
  await flush();
}

describe("Shopping rows hold still while you edit them (#1498)", () => {
  it("covering a card keeps its row, says Have all with an Undo button, and the row leaves after the pointer has gone (#1498)", async () => {
    await mount();
    expect(tableRow(A)).toBeTruthy();
    await cover(A);
    expect(h.setOwned).toHaveBeenCalledWith(A, 2);
    const row = tableRow(A)!;
    expect(row).toBeTruthy();
    expect(row.className).toContain("done");
    expect(row.textContent).toContain("Have all 2");
    expect([...row.querySelectorAll("button")].some((b) => b.textContent === "Undo")).toBe(true);
    // The stepper stays live: the other card is untouched and keeps its place.
    expect(tableRow(B)).toBeTruthy();
    advance(7000);
    expect(tableRow(A)).toBeTruthy();
    pointer(row, "pointerout", { relatedTarget: document.body });
    advance(500);
    expect(tableRow(A)).toBeTruthy();
    advance(200);
    expect(tableRow(A)).toBeNull();
    expect(tableRow(B)).toBeTruthy();
  });

  it("Undo puts the count back to what it was before the hold, in one step (#1498)", async () => {
    await mount();
    await cover(A);
    const undo = [...tableRow(A)!.querySelectorAll("button")].find((b) => b.textContent === "Undo")!;
    await act(async () => undo.click());
    await flush();
    expect(h.setOwned).toHaveBeenLastCalledWith(A, 1);
    expect(h.owned[A]).toBe(1);
    const row = tableRow(A)!;
    expect(row.textContent).not.toContain("Have all");
    expect(row.className).toContain("need");
    pointer(row, "pointerout", { relatedTarget: document.body });
    advance(1000);
    // Back to needing a copy, so it stays after the list settles.
    expect(tableRow(A)).toBeTruthy();
  });

  it("the Owned stepper stays live on a covered row: minus brings it back in place (#1498)", async () => {
    await mount();
    await cover(A);
    const row = tableRow(A)!;
    await act(async () => (row.querySelector('button[aria-label="Decrease owned"]') as HTMLElement).click());
    await flush();
    expect(h.setOwned).toHaveBeenLastCalledWith(A, 1);
    expect(tableRow(A)!.className).toContain("need");
    expect(tableRow(A)!.textContent).not.toContain("Have all");
  });
});
