// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      mql.matches = next;
      for (const l of listeners) l();
    },
    listeners,
  };
}

function Probe({ query }: { query: string }) {
  return <span>{String(useMediaQuery(query))}</span>;
}

function mount(query: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Probe query={query} />));
}

describe("useMediaQuery", () => {
  it("starts from the current match and follows later changes", () => {
    const media = fakeMatchMedia(false);
    mount("(min-width: 900px)");
    expect(host!.textContent).toBe("false");
    act(() => media.set(true));
    expect(host!.textContent).toBe("true");
  });

  it("stops listening when the component unmounts", () => {
    const media = fakeMatchMedia(true);
    mount("(min-width: 900px)");
    expect(media.listeners.size).toBe(1);
    act(() => root!.unmount());
    root = null;
    expect(media.listeners.size).toBe(0);
  });

  it("is false where matchMedia does not exist", () => {
    mount("(min-width: 900px)");
    expect(host!.textContent).toBe("false");
  });
});
