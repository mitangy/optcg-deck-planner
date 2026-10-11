import assert from "node:assert/strict";
import { assertProductionAuthConfig, requireGameToken } from "../src/env.js";
import { gameFirstSeat, gameSeed } from "../src/matchmakeGuard.js";
import { parseCreateOptions } from "../src/protocol.js";

/** Runs `fn` with REQUIRE_GAME_TOKEN=true, as on the deployed server. */
async function withTokensRequired<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env.REQUIRE_GAME_TOKEN;
  process.env.REQUIRE_GAME_TOKEN = "true";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.REQUIRE_GAME_TOKEN;
    else process.env.REQUIRE_GAME_TOKEN = prev;
  }
}

describe("shuffle seeds", () => {
  it("ignores a client-chosen seed when tokens are required (#318)", async () => {
    const seeds = await withTokensRequired(() => [1, 2, 3].map(() => parseCreateOptions({ seed: 42 }).seed));
    assert.ok(seeds.some((s) => s !== 42), `seeds ${seeds.join(",")}`);
  });

  it("does not derive the seed from the clock (#318)", () => {
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_123;
    try {
      const seeds = new Set([gameSeed(), gameSeed(), gameSeed()]);
      assert.ok(seeds.size > 1, "same instant, same seed");
    } finally {
      Date.now = realNow;
    }
  });
});

describe("first seat", () => {
  it("flips a coin on deployed servers whatever the client asks for (#549)", async () => {
    await withTokensRequired(() => {
      const unpinned = new Set(Array.from({ length: 64 }, () => gameFirstSeat()));
      assert.deepEqual([...unpinned].sort(), [0, 1]);
      const pinned = new Set(Array.from({ length: 64 }, () => gameFirstSeat(0)));
      assert.ok(pinned.has(1), "a client asking for seat 0 must not pin it");
    });
  });

  it("lets local dev pin the first seat and defaults to seat 0 (#549)", () => {
    assert.equal(gameFirstSeat(1), 1);
    assert.equal(gameFirstSeat(), 0);
    assert.equal(parseCreateOptions({ firstSeat: 1 }).firstSeat, 1);
  });

  it("rejects a firstSeat other than 0 or 1 (#549)", () => {
    assert.throws(() => parseCreateOptions({ firstSeat: 2 }), /firstSeat/);
    assert.throws(() => parseCreateOptions({ firstSeat: "1" }), /firstSeat/);
  });
});

describe("production auth config", () => {
  it("refuses to start in production with the dev game token secret (#318)", () => {
    assert.throws(
      () => assertProductionAuthConfig({ NODE_ENV: "production", REQUIRE_GAME_TOKEN: "true" }),
      /GAME_TOKEN_SECRET/,
    );
    assert.doesNotThrow(() =>
      assertProductionAuthConfig({ NODE_ENV: "production", REQUIRE_GAME_TOKEN: "true", GAME_TOKEN_SECRET: "s3cret" }),
    );
  });

  it("starts in production without REQUIRE_GAME_TOKEN and still requires tokens (#321)", () => {
    const prod = { NODE_ENV: "production", GAME_TOKEN_SECRET: "s3cret" };
    assert.doesNotThrow(() => assertProductionAuthConfig(prod));
    assert.equal(requireGameToken(prod), true);
    assert.equal(requireGameToken({ ...prod, REQUIRE_GAME_TOKEN: "false" }), true);
    assert.equal(requireGameToken({}), false);
  });
});
