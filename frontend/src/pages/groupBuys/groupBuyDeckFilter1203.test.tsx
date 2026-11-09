// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GroupBuyDetailPage } from "./GroupBuyDetailPage";

const deck = (id: number, sort_order: number, leader: string, leader_name: string) => ({
  id,
  name: `Deck ${id}`,
  sort_order,
  leader_card_id: leader,
  leader_name,
});

const h = vi.hoisted(() => ({
  update: vi.fn(async () => h.detail),
  detail: null as unknown,
}));

h.detail = {
  id: 7,
  title: "Buy",
  status: "open",
  role: "host",
  members: [
    {
      user_id: 1,
      display_name: "Me",
      role: "host",
      deck_ids: [3],
      include_singles: true,
      include_extra_copies: false,
      cards_still_needed: 0,
      remaining_market: 0,
    },
  ],
  lines: [
    {
      card_id: "OP01-001",
      name: "Luffy",
      total_qty: 1,
      market_price: 1,
      remaining_cost: 1,
      tcgplayer_url: "",
      image_url: "",
      members: [{ user_id: 1, display_name: "Me", qty: 1 }],
      alt_arts: [],
      my_qty: 1,
      my_suggested_qty: 1,
      my_is_custom: false,
    },
  ],
  shipping_cost: 0,
  tax_cost: 0,
  shipping_split: "equal",
};

vi.mock("../../api", async (orig) => ({
  ...(await orig<typeof import("../../api")>()),
  api: {
    me: async () => ({ id: 1, display_name: "Me" }),
    groupBuy: async () => h.detail,
    decks: async () => [
      deck(1, 0, "OP01-001", "Luffy"),
      deck(2, 1, "OP01-001", "Luffy"),
      deck(3, 2, "OP01-025", "Zoro"),
      deck(4, 3, "OP01-025", "Zoro"),
    ],
    updateGroupBuyContribution: h.update,
  },
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  h.update.mockClear();
});

async function render() {
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root!.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/group-buys/7"]}>
          <Routes>
            <Route path="/group-buys/:id" element={<GroupBuyDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
  // Filters starts collapsed.
  const toggle = [...host.querySelectorAll<HTMLButtonElement>("button.filter-drawer-toggle")].find((b) =>
    b.textContent?.startsWith("Filters"),
  )!;
  if (toggle.getAttribute("aria-expanded") !== "true") await act(async () => toggle.click());
}

describe("Group buy Include filter groups decks by leader (#1203)", () => {
  it("shows one group per leader plus Other, and ticking a leader ticks all its decks (#1203)", async () => {
    await render();
    const groups = [...host!.querySelectorAll(".deck-filter-group")];
    expect(groups.map((g) => g.querySelector(".deck-filter-group-name")!.textContent)).toEqual([
      "Luffy",
      "Zoro",
      "Other",
    ]);
    expect(groups[2].textContent).toContain("Cards not in a deck");
    expect(groups[2].textContent).toContain("Extra copies");

    // Only Deck 3 ticked: Luffy group none, Zoro group partly ticked.
    const luffy = groups[0].querySelector<HTMLInputElement>(".deck-filter-group-head input")!;
    expect(luffy.checked).toBe(false);
    await act(async () => luffy.click());
    expect(h.update).toHaveBeenCalledWith(7, {
      deck_ids: [3, 1, 2],
      include_singles: true,
      include_extra_copies: false,
    });
  });

  it("ticking a leader group that completes the list sends deck_ids null (#1203)", async () => {
    await render();
    const heads = host!.querySelectorAll<HTMLInputElement>(".deck-filter-group-head input");
    // Zoro group is partly ticked (Deck 3 only): ticking it adds Deck 4 and leaves Luffy's decks out.
    expect(heads[1].indeterminate).toBe(true);
    await act(async () => heads[1].click());
    expect(h.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ deck_ids: [3, 4] }));
    // Ticking Luffy on top of that covers every deck, which is stored as null (all decks).
    h.detail = { ...(h.detail as object), members: [{ ...(h.detail as { members: object[] }).members[0], deck_ids: [3, 4] }] };
    h.update.mockClear();
    await render();
    await act(async () => host!.querySelectorAll<HTMLInputElement>(".deck-filter-group-head input")[0].click());
    expect(h.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ deck_ids: null }));
  });
});
