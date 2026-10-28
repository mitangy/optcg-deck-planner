// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CardScanner } from "./CardScanner";

const h = vi.hoisted(() => {
  const s = {
    models: Promise.resolve() as Promise<void>,
    matchAll: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
    ready: { kind: "ready", candidates: [], totalBytes: 0 },
    whenModelsReady: () => s.models,
  };
  return s;
});

vi.mock("./scanLog", async (orig) => ({ ...(await orig<typeof import("./scanLog")>()), scanLog: () => {} }));
vi.mock("./useScanData", () => ({
  useScanData: () => ({ state: h.ready, download: () => {}, whenModelsReady: h.whenModelsReady }),
}));
vi.mock("./cardScanImage", async (orig) => ({
  ...(await orig<typeof import("./cardScanImage")>()),
  loadImageForScan: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));
vi.mock("./cardScanMulti", async (orig) => ({
  ...(await orig<typeof import("./cardScanMulti")>()),
  matchAllCards: (...args: unknown[]) => h.matchAll(...args),
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
const status = () => document.querySelector(".scan-status-label")?.textContent ?? null;

async function scanWith(models: Promise<void>) {
  h.models = models;
  h.matchAll = vi.fn(async () => []);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <CardScanner items={[]} onClose={() => {}} multi={{}} initialImage={new Blob(["x"], { type: "image/jpeg" })} />
      </QueryClientProvider>,
    );
    await tick();
  });
}

describe("CardScanner multi scan", () => {
  it("waits for the card finder to load before matching, then scans (#764)", async () => {
    let finish!: () => void;
    await scanWith(new Promise<void>((r) => (finish = r)));
    expect(status()).toBe("Loading card finder…");
    expect(h.matchAll).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await tick();
    });
    expect(h.matchAll).toHaveBeenCalledTimes(1);
  });
});
