// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckDetailPage } from "./DeckDetailPage";

const A = "OP01-001";
const B = "OP01-002";

const h = vi.hoisted(() => ({ owned: {} as Record<string, number> }));

const cardView = (card_id: string, needed: number) => ({
  card_id,
  name: card_id,
  rarity: "C",
  color: "Red",
  card_type: "CHARACTER",
  cost: 2,
  needed,
  owned: h.owned[card_id] ?? 0,
  still_need: Math.max(0, needed - (h.owned[card_id] ?? 0)),
  market_price: 1,
  low_price: 1,
  image_url: "",
  tcgplayer_url: "",
  section: "main",
  alt_arts: [],
});

vi.mock("../../api", async (orig) => {
  const real = await orig<typeof import("../../api")>();
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => {
      if (name === "deck")
        return async () => ({
          id: 5,
          name: "Zoro",
          leader_card_id: null,
          leader_name: null,
          prior_decks: [],
          cards: [cardView(A, 2), cardView(B, 1)],
        });
      if (name === "setOwned") return async (card_id: string, qty: number) => ((h.owned[card_id] = qty), { card_id, qty });
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
  h.owned = { [A]: 1, [B]: 0 };
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 40))));
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const tableRow = (id: string) => host.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement | null;

describe("Deck page rows hold still while you edit them (#1498)", () => {
  it("a covered card stays in a To buy only deck with Have all and Undo, then leaves once the pointer has gone (#1498)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={["/decks/5"]}>
            <Routes>
              <Route path="/decks/:id" element={<DeckDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await flush();
    await flush();
    const row = tableRow(A)!;
    expect(row).toBeTruthy();
    act(() => void row.dispatchEvent(new Event("pointerover", { bubbles: true })));
    await act(async () => (row.querySelector('button[aria-label="Increase owned"]') as HTMLElement).click());
    await flush();
    expect(tableRow(A)).toBeTruthy();
    expect(tableRow(A)!.textContent).toContain("Have all 2");
    expect([...tableRow(A)!.querySelectorAll("button")].some((b) => b.textContent === "Undo")).toBe(true);
    act(() => void row.dispatchEvent(Object.assign(new Event("pointerout", { bubbles: true }), { relatedTarget: document.body })));
    advance(700);
    expect(tableRow(A)).toBeNull();
    expect(tableRow(B)).toBeTruthy();
  });
});
