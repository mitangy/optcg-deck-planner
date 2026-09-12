import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteLoopbackToPageHost } from "./config";

describe("rewriteLoopbackToPageHost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves URLs unchanged on localhost pages", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    expect(rewriteLoopbackToPageHost("http://localhost:2567")).toBe(
      "http://localhost:2567",
    );
  });

  it("rewrites localhost service hosts to the page hostname", () => {
    vi.stubGlobal("window", { location: { hostname: "192.168.1.20" } });
    expect(rewriteLoopbackToPageHost("http://localhost:2567")).toBe(
      "http://192.168.1.20:2567",
    );
    expect(rewriteLoopbackToPageHost("http://127.0.0.1:8000/duel")).toBe(
      "http://192.168.1.20:8000/duel",
    );
  });
});
