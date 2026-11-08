// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorMessage } from "./errors";
import { useAsyncResource } from "./useAsyncResource";

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

type Deferred = { promise: Promise<string>; resolve: (v: string) => void; reject: (e: unknown) => void };
function deferred(): Deferred {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Props = { load: (id: string) => Promise<string>; id?: string; enabled?: boolean };
function Probe({ load, id = "a", enabled = true }: Props) {
  const r = useAsyncResource(() => load(id), [id], enabled);
  return (
    <div>
      <p id="s">{r.status === "ready" ? `ready:${r.data}` : r.status === "error" ? `error:${errorMessage(r.error, "?")}` : "loading"}</p>
      <button id="reload" onClick={r.reload}>
        reload
      </button>
    </div>
  );
}

function show(props: Props) {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => root!.render(<Probe {...props} />));
}
const text = () => host!.querySelector("#s")!.textContent;
const settle = () => act(async () => undefined);

describe("useAsyncResource (refactor 3.4b)", () => {
  it("starts loading, then shows the data once the load resolves", async () => {
    const d = deferred();
    show({ load: () => d.promise });
    expect(text()).toBe("loading");
    await act(async () => d.resolve("x"));
    expect(text()).toBe("ready:x");
  });

  it("shows the thrown value when the load rejects", async () => {
    const d = deferred();
    show({ load: () => d.promise });
    await act(async () => d.reject(new Error("nope")));
    expect(text()).toBe("error:nope");
  });

  it("goes back to loading and fetches again when a dependency changes", async () => {
    const load = vi.fn((id: string) => Promise.resolve(id));
    show({ load, id: "a" });
    await settle();
    expect(text()).toBe("ready:a");
    show({ load, id: "b" });
    expect(text()).toBe("loading");
    await settle();
    expect(text()).toBe("ready:b");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops a response that lands after a newer load started", async () => {
    const first = deferred();
    const second = deferred();
    const load = (id: string) => (id === "a" ? first.promise : second.promise);
    show({ load, id: "a" });
    show({ load, id: "b" });
    await act(async () => second.resolve("new"));
    await act(async () => first.resolve("old"));
    expect(text()).toBe("ready:new");
  });

  it("reload() shows loading again and runs the load once more", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("up");
    show({ load });
    await settle();
    expect(text()).toBe("error:down");
    act(() => host!.querySelector<HTMLButtonElement>("#reload")!.click());
    expect(text()).toBe("loading");
    await settle();
    expect(text()).toBe("ready:up");
  });

  it("does not load while disabled, and loads once enabled", async () => {
    const load = vi.fn(() => Promise.resolve("go"));
    show({ load, enabled: false });
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(text()).toBe("loading");
    show({ load, enabled: true });
    await settle();
    expect(text()).toBe("ready:go");
  });
});

describe("errorMessage (refactor 3.4b)", () => {
  it("uses an Error's message and the fallback for anything else", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage("boom", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});
