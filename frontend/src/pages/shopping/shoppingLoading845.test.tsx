// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LightboxShoppingControl } from "./lightboxActions";

const h = vi.hoisted(() => ({
  shopping: null as null | ((v: unknown) => void),
  owned: null as null | ((v: unknown) => void),
  setShoppingExtra: vi.fn(async () => ({ card_id: "OP01-001", qty: 0 })),
}));

vi.mock("../../api", async (orig) => ({
  ...(await orig<typeof import("../../api")>()),
  api: {
    decks: async () => [],
    shopping: () => new Promise((res) => (h.shopping = res)),
    ownedCollection: () => new Promise((res) => (h.owned = res)),
    setShoppingExtra: h.setShoppingExtra,
  },
}));

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
  h.setShoppingExtra.mockClear();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

describe("shopping list button while loading", () => {
  it("Add to shopping list waits for the list to load so it can't overwrite a saved target (#845)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root!.render(<QueryClientProvider client={qc}><LightboxShoppingControl cardId="OP01-001" /></QueryClientProvider>));
    await flush();

    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Add OP01-001 to shopping list"]')!;
    expect(add.disabled).toBe(true);
    expect(add.textContent).toBe("Add to shopping list");
    expect(host.textContent).not.toContain("Owned 0");
    await act(async () => add.click());
    expect(h.setShoppingExtra).not.toHaveBeenCalled();

    // Only the list has loaded: owned counts still pending, so still locked.
    await act(async () => h.shopping!({ items: [{ card_id: "OP01-001", owned: 0, still_need: 3, need: 3, extra_qty: 3, deck_need: 0 }] }));
    await flush();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Buy more OP01-001"]')!.disabled).toBe(true);

    await act(async () => h.owned!({ items: [] }));
    await flush();
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="Buy more OP01-001"]')!;
    expect(more.disabled).toBe(false);
    await act(async () => more.click());
    expect(h.setShoppingExtra).toHaveBeenCalledWith("OP01-001", 4);
  });
});
