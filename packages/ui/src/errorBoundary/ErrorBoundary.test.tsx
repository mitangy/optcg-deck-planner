// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("boom");
  return <p>fine</p>;
}

function render(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

describe("ErrorBoundary", () => {
  it("a child that throws shows the fallback and logs the error (#1346)", () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(host!.textContent).toContain("Something went wrong");
    expect(host!.textContent).toContain("Your saved decks and collection are safe.");
    expect(host!.querySelector("button")?.textContent).toBe("Reload");
    expect(console.error).toHaveBeenCalledWith("Uncaught render error", expect.any(Error), expect.any(String));
  });

  it("the fallback clears when the reset key changes (#1346)", () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(host!.textContent).toContain("Something went wrong");
    act(() =>
      root!.render(
        <ErrorBoundary resetKey="/b">
          <Bomb explode={false} />
        </ErrorBoundary>,
      ),
    );
    expect(host!.textContent).toBe("fine");
  });

  it("the fallback stays while the reset key is unchanged (#1346)", () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Bomb explode />
      </ErrorBoundary>,
    );
    act(() =>
      root!.render(
        <ErrorBoundary resetKey="/a">
          <Bomb explode={false} />
        </ErrorBoundary>,
      ),
    );
    expect(host!.textContent).toContain("Something went wrong");
  });
});
