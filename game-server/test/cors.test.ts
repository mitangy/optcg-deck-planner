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

  it("allows requests with no Origin (non-browser)", () => {
    const headers = matchMaker.controller.getCorsHeaders(new Headers());
    assert.equal(headers["Access-Control-Allow-Origin"], "*");
  });
});
