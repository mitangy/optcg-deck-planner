// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, type PriceHistoryResponse } from "./api";
import { PriceHistory } from "./PriceHistory";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function buyRead(over: Partial<PriceHistoryResponse>): Promise<string> {
  const data: PriceHistoryResponse = {
    card_id: "OP14-001",
    product_id: 1,
    name: "Portgas.D.Ace",
    group_name: "Set",
    released: "2026-09-06",
    current: 10,
    points: [["2026-09-06", 10], ["2026-11-05", 10]],
    ...over,
  };
  vi.spyOn(api, "priceHistory").mockResolvedValue(data);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root!.render(<QueryClientProvider client={qc}><PriceHistory cardId="OP14-001" /></QueryClientProvider>));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  return host.querySelector(".ph-buy")?.textContent ?? "";
}

describe("When to buy uses the card's rarity (#949 follow-up)", () => {
  it("reads a base SR on its own curve, not the all-singles one", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z"), toFake: ["Date"] });
    const sr = await buyRead({ rarity: "SR" });
    act(() => root?.unmount());
    host?.remove();
    const plain = await buyRead({ rarity: null });
    expect(sr).toContain("Nov 2026 – Jan 2027");
    expect(plain).not.toContain("Nov 2026 – Jan 2027");
  });
});
