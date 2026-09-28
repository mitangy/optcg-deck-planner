import { matchMaker } from "colyseus";
import assert from "node:assert/strict";
import { after, before, describe, it } from "mocha";
import { installCorsAllowlist } from "../src/cors.js";
import { getCorsOrigins } from "../src/env.js";

describe("cors allowlist", () => {
  let previous: typeof matchMaker.controller.getCorsHeaders;

  before(() => {
    previous = matchMaker.controller.getCorsHeaders.bind(matchMaker.controller);
    installCorsAllowlist();
  });

  after(() => {
    matchMaker.controller.getCorsHeaders = previous;
  });

  it("reflects allowlisted Origin", () => {
    const origins = getCorsOrigins();
    assert.ok(origins.includes("http://localhost:5174"));
    const headers = matchMaker.controller.getCorsHeaders(
      new Headers({ origin: "http://localhost:5174" }),
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "http://localhost:5174");
  });

  it("rejects unknown browser Origin", () => {
    const headers = matchMaker.controller.getCorsHeaders(
      new Headers({ origin: "https://evil.example" }),
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "null");
  });

  it("reflects Origin matching CORS_ORIGIN_REGEX (full match only)", () => {
    const prev = process.env.CORS_ORIGIN_REGEX;
    process.env.CORS_ORIGIN_REGEX = String.raw`https://optcg-duel-web-git-[a-z0-9-]+-miko21\.vercel\.app`;
    try {
      installCorsAllowlist();
      const branch = "https://optcg-duel-web-git-feat-x-miko21.vercel.app";
      const acao = (origin: string) =>
        matchMaker.controller.getCorsHeaders(new Headers({ origin }))[
          "Access-Control-Allow-Origin"
        ];
      assert.equal(acao(branch), branch);
      assert.equal(acao(`${branch}.evil.example`), "null");
      assert.equal(acao(`https://evil.example/${branch}`), "null");
    } finally {
      if (prev === undefined) delete process.env.CORS_ORIGIN_REGEX;
      else process.env.CORS_ORIGIN_REGEX = prev;
      installCorsAllowlist();
    }
  });

  it("allows requests with no Origin (non-browser)", () => {
    const headers = matchMaker.controller.getCorsHeaders(new Headers());
    assert.equal(headers["Access-Control-Allow-Origin"], "*");
  });
});
