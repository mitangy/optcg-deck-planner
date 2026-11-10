import assert from "node:assert/strict";
import { warnIfDefaultIngestSecretInProduction } from "../src/env.js";

describe("default ingest secret warning", () => {
  it("production without DUEL_INGEST_SECRET logs a loud warning and still starts (#1229)", () => {
    const lines: string[] = [];
    const warned = warnIfDefaultIngestSecretInProduction({ NODE_ENV: "production" }, (m) => lines.push(m));
    assert.equal(warned, true);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /DUEL_INGEST_SECRET/);
  });

  it("stays quiet in production when the secret is set, and outside production (#1229)", () => {
    const lines: string[] = [];
    const log = (m: string) => lines.push(m);
    assert.equal(warnIfDefaultIngestSecretInProduction({ NODE_ENV: "production", DUEL_INGEST_SECRET: "s3cret" }, log), false);
    assert.equal(warnIfDefaultIngestSecretInProduction({ NODE_ENV: "production", DUEL_INGEST_SECRET: "  " }, log), true);
    assert.equal(warnIfDefaultIngestSecretInProduction({}, log), false);
    assert.equal(warnIfDefaultIngestSecretInProduction({ NODE_ENV: "development" }, log), false);
    assert.equal(lines.length, 1);
  });
});
