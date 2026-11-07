// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { useCatalogSearch } from "./useCatalogSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.innerHTML = "";
});

function mount() {
  const out = {} as ReturnType<typeof useCatalogSearch>;
  function Probe() {
    Object.assign(out, useCatalogSearch({ colorKey: "t_color", typeKey: "t_type" }));
    return null;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() =>
    root!.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  return out;
}

describe("useCatalogSearch (refactor 3.3b, C-08)", () => {
  it("searches once typing stops, with the trimmed text, not on every keystroke", async () => {
    const search = vi.spyOn(api, "searchCatalog").mockResolvedValue([]);
    const h = mount();
    act(() => h.setQuery("zo"));
    await act(() => vi.advanceTimersByTimeAsync(200));
    act(() => h.setQuery(" zoro "));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(search).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toMatchObject({ q: "zoro", limit: 40 });
  });

  it("does not search while there is no text and no filter", async () => {
    const search = vi.spyOn(api, "searchCatalog").mockResolvedValue([]);
    const h = mount();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(h.searchEnabled).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });

  it("searches right away for a color filter alone and remembers it under its key", async () => {
    const search = vi.spyOn(api, "searchCatalog").mockResolvedValue([]);
    const h = mount();
    act(() => h.setColor("Red"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toMatchObject({ q: undefined, color: "Red" });
    expect(localStorage.getItem("t_color")).toBe("Red");
  });
});
