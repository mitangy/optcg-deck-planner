// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary, BoardErrorBoundary } from "./CrashScreen";

let root: Root | null = null;
let host: HTMLElement | null = null;
const reload = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  reload.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("board exploded");
  return <p>the board</p>;
}

function render(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

describe("crash screens (#1500)", () => {
  it("a match board that throws is replaced by Reload and rejoin, whose button reloads the page (#1500)", () => {
    render(
      <BoardErrorBoundary>
        <Bomb explode />
      </BoardErrorBoundary>,
    );
    expect(host!.querySelector("[role=alert]")?.textContent).toContain("Something broke. Reload and rejoin.");
    const button = host!.querySelector("button")!;
    expect(button.textContent).toBe("Reload and rejoin");
    act(() => button.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a healthy board renders untouched (#1500)", () => {
    render(
      <BoardErrorBoundary>
        <Bomb explode={false} />
      </BoardErrorBoundary>,
    );
    expect(host!.textContent).toBe("the board");
  });

  it("the app root shows its own reload screen when everything inside breaks (#1500)", () => {
    render(
      <AppErrorBoundary>
        <Bomb explode />
      </AppErrorBoundary>,
    );
    expect(host!.textContent).toContain("Something went wrong");
    expect(host!.textContent).not.toContain("rejoin");
    act(() => host!.querySelector("button")!.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
