// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, type User } from "../api";
import { ScanShare } from "../scanner/ui/ScanShare";
import { SIGNED_IN_HINT_KEY } from "../app/prerendered";

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
  vi.restoreAllMocks();
  localStorage.clear();
});

const wait = () => new Promise((r) => setTimeout(r, 40));

describe("the signed-in hint follows every reader of the session query (refactor 0.5, C-03)", () => {
  it("a page that only reads the session still records the signed-in hint for prerendered pages (#914)", async () => {
    localStorage.clear();
    vi.spyOn(api, "me").mockResolvedValue({ id: 1, share_scans: false } as unknown as User);
    vi.spyOn(api, "myScanSamples").mockResolvedValue({ count: 0 } as never);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root!.render(
        <QueryClientProvider client={qc}>
          <ScanShare />
        </QueryClientProvider>,
      );
      await wait();
    });
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe("1");
  });
});
