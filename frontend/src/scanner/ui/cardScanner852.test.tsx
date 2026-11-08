// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiScanItem } from "../match/cardScanMulti";
import { CardScanner } from "./CardScanner";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  me: { id: 1, email: "a@b.c", name: "A", share_scans: true } as Record<string, unknown> | null,
  addOwned: undefined as unknown as import("vitest").Mock<(...args: unknown[]) => unknown>,
  upload: undefined as unknown as import("vitest").Mock<(...args: unknown[]) => unknown>,
  prefs: undefined as unknown as import("vitest").Mock<(...args: unknown[]) => unknown>,
  del: undefined as unknown as import("vitest").Mock<(...args: unknown[]) => unknown>,
  mine: 0,
}));

vi.mock("../runtime/scanLog", async (orig) => ({ ...(await orig<typeof import("../runtime/scanLog")>()), scanLog: () => {} }));
vi.mock("../runtime/useScanData", () => ({
  useScanData: () => ({ state: { kind: "ready", candidates: [], totalBytes: 0 }, download: () => {}, whenModelsReady: () => Promise.resolve() }),
}));
vi.mock("../runtime/cardScanImage", async (orig) => ({
  ...(await orig<typeof import("../runtime/cardScanImage")>()),
  loadImageForScan: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));
vi.mock("../../api", async (orig) => {
  const real = await orig<typeof import("../../api")>();
  return {
    ...real,
    api: {
      ...real.api,
      me: async () => h.me,
      searchCatalog: async ({ q }: { q: string }) => [
        { card_id: q, name: `Card ${q}`, image_url: "", market_price: null },
      ],
      addOwned: (...a: unknown[]) => h.addOwned(...a),
      uploadScanSamples: (...a: unknown[]) => h.upload(...a),
      updatePreferences: (...a: unknown[]) => h.prefs(...a),
      myScanSamples: async () => ({ count: h.mine }),
      deleteMyScanSamples: (...a: unknown[]) => h.del(...a),
    },
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  h.calls = [];
  h.me = { id: 1, email: "a@b.c", name: "A", share_scans: true };
  h.mine = 0;
  h.addOwned = vi.fn(async () => {
    h.calls.push("add");
    return { items: [] };
  });
  h.upload = vi.fn(async () => {
    h.calls.push("upload");
    return { saved: 1 };
  });
  h.prefs = vi.fn(async (body: unknown) => (h.me = { ...h.me, ...(body as object) }));
  h.del = vi.fn(async () => ({ deleted: 3 }));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const tick = () => new Promise((r) => setTimeout(r, 20));
const quad: MultiScanItem["quad"] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const crop = (cardId: string | null, confidence: MultiScanItem["confidence"], n: number): MultiScanItem => ({
  quad,
  thumbUrl: `thumb-${n}`,
  sampleUrl: `data:image/jpeg;base64,${n}`,
  cardId,
  inliers: 30,
  runnerUp: 1,
  confidence,
});

async function openTray(found: MultiScanItem[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CardScanner
          items={[]}
          onClose={() => {}}
          multi={{ matcher: async () => found }}
          initialImage={new Blob(["x"], { type: "image/jpeg" })}
        />
      </QueryClientProvider>,
    );
    await tick();
    await tick();
  });
  await act(async () => {
    await tick();
  });
}

const press = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
    await tick();
  });
};
const addButton = () => [...document.querySelectorAll("button")].find((b) => /^Add \d+ cards? to collection/.test(b.textContent ?? ""));
const byText = (re: RegExp) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
const shareBox = () => document.querySelector<HTMLInputElement>(".scan-share-toggle input");

describe("scan crop sharing (#852)", () => {
  it("uploads the added crops with their labels after the add succeeded (#852)", async () => {
    await openTray([crop("OP01-120", "sure", 1), crop("OP01-001", "check", 2)]);
    await press(addButton());
    expect(h.calls).toEqual(["add", "upload"]);
    expect(h.upload).toHaveBeenCalledWith([
      { image: "data:image/jpeg;base64,1", predicted_id: "OP01-120", confidence: "sure", final_id: "OP01-120", label: "confirmed" },
      { image: "data:image/jpeg;base64,2", predicted_id: "OP01-001", confidence: "check", final_id: "OP01-001", label: "confirmed" },
    ]);
  });

  it("uploads nothing when the user switched sharing off (#852)", async () => {
    h.me = { ...h.me, share_scans: false };
    await openTray([crop("OP01-120", "sure", 1)]);
    await press(addButton());
    expect(h.addOwned).toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("uploads nothing when adding the cards failed (#852)", async () => {
    h.addOwned = vi.fn(async () => {
      throw new Error("down");
    });
    await openTray([crop("OP01-120", "sure", 1)]);
    await press(addButton());
    expect(h.upload).not.toHaveBeenCalled();
    expect(document.querySelector(".scan-tray-error")?.textContent).toBe("down");
  });

  it("a failed upload never blocks the add or shows an error (#852)", async () => {
    h.upload = vi.fn(async () => {
      throw new Error("403");
    });
    await openTray([crop("OP01-120", "sure", 1)]);
    await press(addButton());
    expect(document.querySelector(".scan-added-title")?.textContent).toBe("Added 1 card");
    expect(document.body.textContent).not.toContain("403");
  });

  it("sends at most 40 crops per request (#852)", async () => {
    await openTray(Array.from({ length: 45 }, (_, i) => crop("OP01-120", "sure", i)));
    await press(addButton());
    expect(h.upload.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([40, 5]);
  });

  it("the switch shows the setting and saves a change with PATCH /preferences (#852)", async () => {
    await openTray([crop("OP01-120", "sure", 1)]);
    expect(shareBox()?.checked).toBe(true);
    await press(shareBox());
    expect(h.prefs).toHaveBeenCalledWith({ share_scans: false });
    expect(shareBox()?.checked).toBe(false);
  });

  it("deleting shared crops asks first, then deletes and says Deleted (#852)", async () => {
    h.mine = 3;
    await openTray([crop("OP01-120", "sure", 1)]);
    await press(byText(/Delete my shared crops/));
    expect(h.del).not.toHaveBeenCalled();
    expect(document.querySelector(".scan-share-delete")?.textContent).toContain("Delete your 3 shared crops?");
    await press(byText(/^Delete$/));
    expect(h.del).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".scan-share-delete")?.textContent).toBe("Deleted");
  });

  it("offers no delete when nothing was shared (#852)", async () => {
    await openTray([crop("OP01-120", "sure", 1)]);
    expect(document.querySelector(".scan-share-delete")).toBeNull();
  });
});
