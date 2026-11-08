import assert from "node:assert/strict";
import { SlidingWindowLimiter } from "../src/rateLimit.js";

describe("SlidingWindowLimiter", () => {
  let now = 0;
  const limiter = () => new SlidingWindowLimiter(3, 1000, () => now);
  beforeEach(() => {
    now = 10_000;
  });

  it("allows the limit within a window and refuses the next hit (refactor 3.5a)", () => {
    const l = limiter();
    assert.deepEqual([l.consume("a"), l.consume("a"), l.consume("a"), l.consume("a")], [true, true, true, false]);
  });

  it("frees a hit only once it is older than the window (refactor 3.5a)", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.consume("a");
    now += 1000;
    assert.equal(l.consume("a"), false, "a hit exactly one window old still counts");
    now += 1;
    assert.equal(l.consume("a"), true, "older than the window: it no longer counts");
  });

  it("does not count a refused hit against the window (refactor 3.5a)", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.consume("a");
    now += 600;
    for (let i = 0; i < 5; i++) assert.equal(l.consume("a"), false);
    now += 401; // the three counted hits are now out of the window; the five refused ones, if kept, are not
    assert.deepEqual([l.consume("a"), l.consume("a"), l.consume("a"), l.consume("a")], [true, true, true, false]);
  });

  it("keeps each key's window separate, and forget clears one key (refactor 3.5a)", () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) l.consume("a");
    assert.equal(l.consume("b"), true, "another session is not limited by a's hits");
    assert.equal(l.consume("a"), false);
    l.forget("a");
    assert.equal(l.consume("a"), true, "a taken-over seat's old session starts fresh");
  });
});
