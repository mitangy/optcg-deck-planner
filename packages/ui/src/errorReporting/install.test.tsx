// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../errorBoundary";
import { installErrorReporting } from "./install";

let stop: (() => void) | null = null;
let root: Root | null = null;
let host: HTMLElement | null = null;
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stop?.();
  stop = null;
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
});

const install = () =>
  (stop = installErrorReporting({ app: "duel", url: "https://api.test/client-errors", release: "abc1234", headers: () => ({ Authorization: "Bearer t" }) }));

function sentBodies(): Array<Record<string, string>> {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([, init]) => JSON.parse(String(init.body)));
}

describe("installErrorReporting", () => {
  it("posts an uncaught error with the app, release and the page path (#1500)", () => {
    install();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaput"), message: "kaput" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/client-errors");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(sentBodies()[0]).toMatchObject({ app: "duel", release: "abc1234", url: window.location.pathname, message: "Error: kaput" });
  });

  it("posts an unhandled promise rejection (#1500)", () => {
    install();
    const ev = new Event("unhandledrejection");
    Object.assign(ev, { reason: new TypeError("nope") });
    window.dispatchEvent(ev);
    expect(sentBodies()[0]!.message).toBe("TypeError: nope");
  });

  it("reports nothing from an automated browser (#1500)", () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    install();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaput"), message: "kaput" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops listening once uninstalled (#1500)", () => {
    install();
    stop!();
    stop = null;
    window.dispatchEvent(new Event("error"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an error the boundary caught, with its component stack, and shows the app's own fallback (#1500)", () => {
    install();
    function Bomb(): never {
      throw new Error("render blew up");
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <ErrorBoundary fallback={<p>custom screen</p>}>
          <Bomb />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe("custom screen");
    const body = sentBodies()[0]!;
    expect(body.message).toBe("Error: render blew up");
    expect(body.stack).toContain("Component stack:");
  });
});
