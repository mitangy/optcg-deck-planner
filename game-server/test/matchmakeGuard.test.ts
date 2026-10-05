import assert from "node:assert/strict";
import { assertProductionAuthConfig } from "../src/env.js";
import { gameSeed } from "../src/matchmakeGuard.js";
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
  it("ignores a client-chosen seed when tokens are required (#SEC)", async () => {
    const seeds = await withTokensRequired(() => [1, 2, 3].map(() => parseCreateOptions({ seed: 42 }).seed));
    assert.ok(seeds.some((s) => s !== 42), `seeds ${seeds.join(",")}`);
  });

  it("does not derive the seed from the clock (#SEC)", () => {
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

describe("production auth config", () => {
  it("refuses to start in production with the dev game token secret (#SEC)", () => {
    assert.throws(
      () => assertProductionAuthConfig({ NODE_ENV: "production", REQUIRE_GAME_TOKEN: "true" }),
      /GAME_TOKEN_SECRET/,
    );
    assert.doesNotThrow(() =>
      assertProductionAuthConfig({ NODE_ENV: "production", REQUIRE_GAME_TOKEN: "true", GAME_TOKEN_SECRET: "s3cret" }),
    );
  });

  it("refuses to start in production without REQUIRE_GAME_TOKEN (#SEC)", () => {
    assert.throws(
      () => assertProductionAuthConfig({ NODE_ENV: "production", GAME_TOKEN_SECRET: "s3cret" }),
      /REQUIRE_GAME_TOKEN/,
    );
  });
});
