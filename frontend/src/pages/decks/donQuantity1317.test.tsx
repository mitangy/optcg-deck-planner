// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AvailableDonSection } from "./AvailableDonSection";
import { formatDonCount } from "./deckEditing";
import type { DeckDetail } from "../../api";
import { DECK_DON_AVAILABLE_OPEN_KEY } from "../../storage/keys";

const upsertDeckCard = vi.fn();
const searchCatalog = vi.fn();
vi.mock("../../api", async (orig) => ({
  ...(await orig<typeof import("../../api")>()),
  api: {
    upsertDeckCard: (...a: unknown[]) => upsertDeckCard(...a),
    searchCatalog: (...a: unknown[]) => searchCatalog(...a),
  },
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem(DECK_DON_AVAILABLE_OPEN_KEY, "1");
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  upsertDeckCard.mockReset();
  searchCatalog.mockReset();
});

const wait = () => new Promise((r) => setTimeout(r, 30));
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const addButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button.don-tile-add"))[0]!;

function deckWithDon(needed: number) {
  return {
    id: 7,
    don_cards: needed,
    cards: needed > 0 ? [{ card_id: "DON-001", needed, section: "don", card_type: "DON!!" }] : [],
  } as unknown as DeckDetail;
}

async function mount(deck: DeckDetail, onUpdated = vi.fn()) {
  searchCatalog.mockResolvedValue([
    { card_id: "DON-001", name: "Luffy DON!!", card_type: "DON!!", image_url: null, group_name: "Set", market_price: 1 },
  ]);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <AvailableDonSection deckId={7} deck={deck} onUpdated={onUpdated} />
      </QueryClientProvider>,
    );
  });
  await act(wait);
  return onUpdated;
}

describe("Add DON!! by quantity (#1317)", () => {
  it("adds the chosen quantity in one save on top of what the deck already has (#1317)", async () => {
    upsertDeckCard.mockResolvedValue(deckWithDon(5));
    await mount(deckWithDon(2));
    const plus = byLabel("More DON-001 to add");
    await act(async () => {
      plus.click();
    });
    await act(async () => {
      byLabel("More DON-001 to add").click();
    });
    expect(addButton().textContent).toBe("Add 3");
    await act(async () => {
      addButton().click();
    });
    await act(wait);
    expect(upsertDeckCard).toHaveBeenCalledTimes(1);
    expect(upsertDeckCard).toHaveBeenCalledWith(7, "DON-001", 5, true);
  });

  it("resets the quantity to 1 after adding (#1317)", async () => {
    upsertDeckCard.mockResolvedValue(deckWithDon(4));
    await mount(deckWithDon(1));
    await act(async () => {
      byLabel("More DON-001 to add").click();
    });
    await act(async () => {
      addButton().click();
    });
    await act(wait);
    expect(addButton().textContent).toBe("Add");
  });

  it("still lets you add when the deck already has 10 DON!! (#1317)", async () => {
    upsertDeckCard.mockResolvedValue(deckWithDon(11));
    await mount(deckWithDon(10));
    expect(addButton().disabled).toBe(false);
    await act(async () => {
      addButton().click();
    });
    await act(wait);
    expect(upsertDeckCard).toHaveBeenCalledWith(7, "DON-001", 11, true);
  });

  it("shows how many DON!! are extras past the 10 a deck plays (#1317)", () => {
    expect(formatDonCount(10)).toBe("10/10");
    expect(formatDonCount(12)).toBe("12/10 (+2 extra)");
    expect(formatDonCount(12, { inDeck: true })).toBe("12/10 in deck · 2 extra");
    expect(formatDonCount(4, { inDeck: true })).toBe("4/10 in deck");
  });
});
