import { describe, expect, it } from "vitest";
import { isSafeLoginNext } from "./GroupBuys";

describe("isSafeLoginNext", () => {
  it("allows same-origin relative paths", () => {
    expect(isSafeLoginNext("/")).toBe(true);
    expect(isSafeLoginNext("/group-buy/join/abc")).toBe(true);
    expect(isSafeLoginNext("/decks?x=1")).toBe(true);
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(isSafeLoginNext("//evil.example")).toBe(false);
    expect(isSafeLoginNext("https://evil.example")).toBe(false);
    expect(isSafeLoginNext("/\\evil.example")).toBe(false);
    expect(isSafeLoginNext("/%2f%2fevil.example")).toBe(false);
  });
});
