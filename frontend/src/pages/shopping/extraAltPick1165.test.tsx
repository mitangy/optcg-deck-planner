// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ShoppingItem } from "../../api";
import { nextAltPick, ShoppingExtraControl } from "./lightboxActions";

const h = vi.hoisted(() => ({
  setShoppingExtra: vi.fn(async () => ({ card_id: "OP01-001", qty: 0 })),
  setDisplayArt: vi.fn(async () => ({})),
  setCardPrinting: vi.fn(async () => ({})),
}));

vi.mock("../../api", async (orig) => ({
  ...(await orig<typeof import("../../api")>()),
  api: { setShoppingExtra: h.setShoppingExtra, setDisplayArt: h.setDisplayArt, setCardPrinting: h.setCardPrinting },
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  Object.values(h).forEach((f) => f.mockClear());
});

async function press(label: string, altProductId: number, item?: Partial<ShoppingItem>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root!.render(
      <QueryClientProvider client={qc}>
        <ShoppingExtraControl
          cardId="OP01-001"
          item={item as ShoppingItem | undefined}
          owned={0}
          altProductId={altProductId}
        />
      </QueryClientProvider>,
    ),
  );
  await act(async () => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}

describe("Add cards drawer puts an alt row's copy on that alt (#1165)", () => {
  it("adding from an alt row buys that copy as the alt (#1165)", async () => {
    await press("Add OP01-001 alt art to shopping list", 555);
    expect(h.setShoppingExtra).toHaveBeenCalledWith("OP01-001", 1);
    expect(h.setCardPrinting).toHaveBeenCalledWith("OP01-001", 555, 1, []);
  });

  it("the alt pick is written for the direct add only, never into the decks' alt picks (#1165)", async () => {
    await press("Add OP01-001 alt art to shopping list", 555);
    expect(h.setCardPrinting.mock.calls[0]?.[3]).toEqual([]);
  });

  it("stepping the added copies down to 0 writes no alt pick, the extra row already cleared it (#1165)", async () => {
    await press("Buy fewer OP01-001 alt art", 555, {
      still_need: 1,
      extra_qty: 1,
      deck_need: 0,
      alt_arts: [{ product_id: 555, wanted: 1 }],
    } as unknown as Partial<ShoppingItem>);
    expect(h.setShoppingExtra).toHaveBeenCalledWith("OP01-001", 0);
    expect(h.setCardPrinting).not.toHaveBeenCalled();
  });

  it("adding from a base row writes no alt pick (#1165)", async () => {
    await press("Add OP01-001 to shopping list", 0);
    expect(h.setShoppingExtra).toHaveBeenCalledWith("OP01-001", 1);
    expect(h.setCardPrinting).not.toHaveBeenCalled();
  });

  it("the alt pick follows the stepper and never exceeds the added copies (#1165)", () => {
    expect(nextAltPick(1, 2, true)).toBe(2);
    expect(nextAltPick(2, 2, true)).toBe(2);
    expect(nextAltPick(2, 3, false)).toBe(1);
    expect(nextAltPick(2, 1, false)).toBe(1);
    expect(nextAltPick(0, 0, false)).toBe(0);
  });
});
