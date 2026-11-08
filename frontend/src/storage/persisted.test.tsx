// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bool01, choiceCodec, jsonSetCodec, usePersistedState, type PersistedCodec } from "./persisted";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => {
    for (const r of roots) r.unmount();
  });
  roots.length = 0;
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.innerHTML = "";
});

/** Mounts a component that holds the hook and exposes its current value and setter. */
function mountHook<T>(key: string | undefined, def: T, codec: PersistedCodec<T>) {
  const out = {} as { value: T; set: (v: T) => void };
  function Probe() {
    const [value, set] = usePersistedState(key, def, codec);
    out.value = value;
    out.set = set;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  act(() => root.render(<Probe />));
  return out;
}

const isString = (x: unknown): x is string => typeof x === "string";

describe("usePersistedState (refactor 3.3b, C-07)", () => {
  it("reads the stored value on mount", () => {
    localStorage.setItem("k", "1");
    expect(mountHook("k", false, bool01).value).toBe(true);
  });

  it("falls back to the default when the stored JSON is corrupt", () => {
    localStorage.setItem("k", "{not json");
    expect(mountHook("k", new Set(["d"]), jsonSetCodec(isString)).value).toEqual(new Set(["d"]));
  });

  it("falls back to the default for a stale choice or a stored value the codec cannot use (#527)", () => {
    localStorage.setItem("k", "Teal");
    expect(mountHook("k", "", choiceCodec(["", "Red"])).value).toBe("");
    localStorage.setItem("k", '{"a":1}');
    expect(mountHook("k2", new Set<string>(), jsonSetCodec(isString)).value).toEqual(new Set());
    expect(mountHook("k", new Set(["d"]), jsonSetCodec(isString)).value).toEqual(new Set(["d"]));
  });

  it("keeps a stored value that is still an option, including the empty All choice (#527)", () => {
    localStorage.setItem("k", "");
    expect(mountHook("k", "Red", choiceCodec(["", "Red"])).value).toBe("");
  });

  it("writes every change back in the stored format", () => {
    const h = mountHook("k", new Set<string>(), jsonSetCodec(isString));
    act(() => h.set(new Set(["OP01-001", "OP01-002"])));
    expect(localStorage.getItem("k")).toBe('["OP01-001","OP01-002"]');
    const flag = mountHook("f", true, bool01);
    act(() => flag.set(false));
    expect(localStorage.getItem("f")).toBe("0");
  });

  it("drops non-string items from a stored array", () => {
    localStorage.setItem("k", '["a",3,null,"b"]');
    expect(mountHook("k", new Set<string>(), jsonSetCodec(isString)).value).toEqual(new Set(["a", "b"]));
  });

  it("neither throws nor loses the value when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const h = mountHook("k", true, bool01);
    expect(h.value).toBe(true);
    act(() => h.set(false));
    expect(h.value).toBe(false);
  });

  it("is plain state without a key", () => {
    const h = mountHook(undefined, false, bool01);
    act(() => h.set(true));
    expect(h.value).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
