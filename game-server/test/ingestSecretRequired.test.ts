import assert from "node:assert/strict";
import { assertProductionIngestSecret } from "../src/env.js";

describe("DUEL_INGEST_SECRET in production", () => {
  it("production without DUEL_INGEST_SECRET refuses to start (#1345)", () => {
    assert.throws(() => assertProductionIngestSecret({ NODE_ENV: "production" }), /DUEL_INGEST_SECRET/);
    assert.throws(() => assertProductionIngestSecret({ NODE_ENV: "production", DUEL_INGEST_SECRET: "  " }), /DUEL_INGEST_SECRET/);
  });

  it("a set secret, or any non-production environment, starts normally (#1345)", () => {
    assert.doesNotThrow(() => assertProductionIngestSecret({ NODE_ENV: "production", DUEL_INGEST_SECRET: "s3cret" }));
    assert.doesNotThrow(() => assertProductionIngestSecret({}));
    assert.doesNotThrow(() => assertProductionIngestSecret({ NODE_ENV: "development" }));
  });
});
