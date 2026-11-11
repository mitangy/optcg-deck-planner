// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ShoppingPage } from "./ShoppingPage";
import { SHOPPING_DECKS_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

const h = vi.hoisted(() => ({
  decks: [] as { id: number }[],
  shopping: vi.fn(async (_ids?: number[], _opts?: unknown) => ({ items: [] })),
}));

vi.mock("../../api", async (orig) => {
  const real = await orig<typeof import("../../api")>();
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => {
      if (name === "decks") return async () => h.decks;
      if (name === "shopping") return h.shopping;
      return () => new Promise(() => {});
    },
  });
  return { ...real, api };
});

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
  h.decks = [];
  h.shopping.mockClear();
  localStorage.clear();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

async function mount(): Promise<QueryClient> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root!.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ShoppingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
  return qc;
}

// Master Shopping's own request carries options; other widgets ask for the unfiltered list.
const lastIds = () => h.shopping.mock.calls.filter((c) => c[1] !== undefined).at(-1)?.[0];

describe("Master Shopping deck filter with no decks (#1211)", () => {
  it("a deck imported after visiting with zero decks is ticked and requested (#1211)", async () => {
    const qc = await mount();
    h.decks = [{ id: 7 }];
    await act(async () => qc.setQueryData(qk.decks(), h.decks));
    await flush();
    expect(lastIds()).toEqual([7]);
  });

  it("a legacy stored [] with decks present reads as all decks (#1211)", async () => {
    localStorage.setItem(SHOPPING_DECKS_KEY, "[]");
    h.decks = [{ id: 7 }];
    await mount();
    expect(lastIds()).toEqual([7]);
  });

  it("unticking every deck still requests no decks after a reload (#1211)", async () => {
    h.decks = [{ id: 7 }];
    const qc = await mount();
    const btn = (re: RegExp) => [...host!.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
    // Include decks sits inside the Filters panel.
    await flush();
    const f = btn(/^Filters/)!;
    await act(async () => f.click());
    const clearAll = btn(/^Clear all$/);
    expect(clearAll).toBeTruthy();
    await act(async () => clearAll!.click());
    await flush();
    expect(lastIds()).toEqual([]);
    qc.clear();
    act(() => root?.unmount());
    host!.remove();
    h.shopping.mockClear();
    await mount();
    expect(lastIds()).toEqual([]);
  });
});
