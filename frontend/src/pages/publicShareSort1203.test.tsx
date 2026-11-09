// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PublicSharePage } from "./PublicSharePage";

const item = (card_id: string, price: number) => ({
  card_id,
  name: `Card ${card_id}`,
  color: "Red",
  rarity: "R",
  card_type: "Character",
  cost: "3",
  need: 1,
  owned: 0,
  alts_owned: 0,
  still_need: 1,
  market_price: price,
  remaining_cost: price,
  product_id: 1,
  tcgplayer_url: "",
  image_url: "",
  used_in: [],
});

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: {
    me: async () => null,
    publicShare: async () => ({
      kind: "shopping",
      owner_name: "Nami",
      deck_name: "List",
      viewer_signed_in: false,
      cards_still_needed: 3,
      remaining_market: 15,
      items: [item("OP01-001", 1), item("OP01-002", 9), item("OP01-003", 5)],
    }),
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
  localStorage.clear();
});

const order = () =>
  [...host!.querySelectorAll(".data-table tbody .card-id")].map((e) => e.textContent);
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

describe("Share page Filters and Sort (#1203)", () => {
  it("the list follows the Sort menu: ticking Price puts the dearest card first (#1203)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () =>
      root!.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/share/tok"]}>
            <Routes>
              <Route path="/share/:token" element={<PublicSharePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await flush();
    // Default Color > Set: same color, so card order.
    expect(order()).toEqual(["OP01-001", "OP01-002", "OP01-003"]);

    const toggle = [...host.querySelectorAll<HTMLButtonElement>("button.filter-drawer-toggle")].find((b) =>
      b.textContent?.startsWith("Filters"),
    )!;
    if (toggle.getAttribute("aria-expanded") !== "true") await act(async () => toggle.click());
    expect(host.textContent).toContain("Still need only");
    await act(async () => host!.querySelector<HTMLButtonElement>("button.sort-menu-btn")!.click());
    const price = [...document.querySelectorAll<HTMLLabelElement>(".sort-menu-item label")].find((l) =>
      l.textContent?.startsWith("Price"),
    )!;
    await act(async () => price.querySelector("input")!.click());
    expect(order()).toEqual(["OP01-002", "OP01-003", "OP01-001"]);
  });
});
