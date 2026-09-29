import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "mocha";
import { getGameTokenSecret } from "../src/env.js";
import { sanitizeDisplayName, verifyGameToken } from "../src/gameToken.js";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Mirror of backend app.game_tokens.mint_game_token. */
function mint(payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", getGameTokenSecret()).update(body).digest());
  return `${body}.${sig}`;
}

const future = () => Math.floor(Date.now() / 1000) + 600;

describe("game token display names", () => {
  it("carries the signed display name", () => {
    const t = mint({ uid: 7, email: "a@x.com", exp: future(), name: "StrawHat" });
    const p = verifyGameToken(t);
    assert.ok(p);
    assert.equal(p.uid, 7);
    assert.equal(p.name, "StrawHat");
  });

  it("older tokens without a name still verify", () => {
    const p = verifyGameToken(mint({ uid: 8, email: "b@x.com", exp: future() }));
    assert.ok(p);
    assert.equal(p.name, undefined);
  });

  it("sanitizes names", () => {
    assert.equal(sanitizeDisplayName("  Zoro\u0000\n "), "Zoro");
    assert.equal(sanitizeDisplayName("x".repeat(60))?.length, 40);
    assert.equal(sanitizeDisplayName(""), undefined);
    assert.equal(sanitizeDisplayName(42), undefined);
  });
});
