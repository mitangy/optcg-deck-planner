// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogCardResult, ShoppingItem } from "./api";
import { CardScanner } from "./CardScanner";

const h = vi.hoisted(() => ({
  matchAll: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("./scanLog", async (orig) => ({ ...(await orig<typeof import("./scanLog")>()), scanLog: () => {} }));
vi.mock("./useScanData", () => ({
  useScanData: () => ({
    state: { kind: "ready", candidates: [], totalBytes: 0 },
    download: () => {},
    whenModelsReady: () => Promise.resolve(),
  }),
}));
vi.mock("./cardScanImage", async (orig) => ({
  ...(await orig<typeof import("./cardScanImage")>()),
  loadImageForScan: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));
vi.mock("./cardScanMulti", async (orig) => ({
  ...(await orig<typeof import("./cardScanMulti")>()),
  matchAllCards: (...args: unknown[]) => h.matchAll(...args),
}));

const card = {
  card_id: "OP01-120",
  name: "Shanks",
  rarity: "SEC",
  color: "Red",
  card_type: "Character",
  cost: 9,
  market_price: 10,
  low_price: 9,
  image_url: "",
  tcgplayer_url: "",
  group_name: "Romance Dawn",
} as CatalogCardResult;

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  api: {
    ...(await orig<typeof import("./api")>()).api,
    searchCatalog: async () => [card],
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
});

const tick = () => new Promise((r) => setTimeout(r, 20));
const text = () => document.body.textContent ?? "";

async function scan(props: { showNeed: boolean; target?: "shopping" }) {
  const crop = (n: number) => ({
    quad: [],
    thumbUrl: `data:image/png;base64,${n}`,
    cardId: "OP01-120",
    inliers: 30,
    runnerUp: 1,
    confidence: "sure",
  });
  h.matchAll = vi.fn(async () => [crop(1), crop(2), crop(3)]);
  const items = [{ card_id: "OP01-120", need: 4, owned: 2, still_need: 2, used_in: ["Red"] }] as ShoppingItem[];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <CardScanner
          items={items}
          showNeed={props.showNeed}
          onClose={() => {}}
          multi={{ target: props.target }}
          initialImage={new Blob(["x"], { type: "image/jpeg" })}
        />
      </QueryClientProvider>,
    );
    await tick();
    await tick();
  });
}

describe("CardScanner multi scan on the Shopping page", () => {
  it("Shopping scan counts copies of each card and shows what you still need (#849)", async () => {
    await scan({ showNeed: true, target: "shopping" });
    expect(document.querySelector(".scan-qty-n")?.textContent).toBe("3");
    expect(document.querySelector(".scan-tray-need")?.textContent).toBe("Still need 2");
    expect(text()).toContain("Mark 3 as owned");
    expect(text()).not.toContain("to collection");
  });

  it("Collection scan shows no need line and keeps the add-to-collection button (#849)", async () => {
    await scan({ showNeed: false });
    expect(document.querySelector(".scan-qty-n")?.textContent).toBe("3");
    expect(document.querySelector(".scan-tray-need")).toBeNull();
    expect(text()).toContain("Add 3 cards to collection");
  });
});
