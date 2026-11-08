// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createStore } from "./createStore";

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

function mount(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

describe("createStore (refactor 2.1b)", () => {
  it("tells subscribers about a change, and a derived update sees the previous value", () => {
    const store = createStore(1);
    const seen = vi.fn();
    store.subscribe(seen);
    store.set(2);
    store.set((n) => n + 10);
    expect(store.get()).toBe(12);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the value did not change", () => {
    const store = createStore("a");
    const seen = vi.fn();
    store.subscribe(seen);
    store.set("a");
    expect(seen).not.toHaveBeenCalled();
  });

  it("stops telling a listener once it unsubscribes", () => {
    const store = createStore(0);
    const seen = vi.fn();
    const off = store.subscribe(seen);
    off();
    store.set(1);
    expect(seen).not.toHaveBeenCalled();
  });

  it("re-renders a component only when the part it selected changed", () => {
    const store = createStore({ name: "Nami", count: 0 });
    let renders = 0;
    function Name() {
      renders++;
      return <p>{store.use((v) => v.name)}</p>;
    }
    mount(<Name />);
    expect(host!.textContent).toBe("Nami");
    const before = renders;
    act(() => store.set((v) => ({ ...v, count: v.count + 1 })));
    expect(renders).toBe(before);
    act(() => store.set((v) => ({ ...v, name: "Zoro" })));
    expect(host!.textContent).toBe("Zoro");
  });

  it("gives a component the whole value when it passes no selector", () => {
    const store = createStore<string | null>(null);
    function Title() {
      return <p>{store.use() ?? "none"}</p>;
    }
    mount(<Title />);
    expect(host!.textContent).toBe("none");
    act(() => store.set("Report a problem"));
    expect(host!.textContent).toBe("Report a problem");
  });
});
