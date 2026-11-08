import assert from "node:assert/strict";
import { getRankedMatchCreateSecret } from "../src/env.js";
import { parseCreateOptions } from "../src/protocol.js";
import { buildRoomConfig } from "../src/rooms/duel/config.js";

describe("buildRoomConfig", () => {
  const build = (options: Record<string, unknown>) => buildRoomConfig(options, parseCreateOptions(options));

  it("makes a room ranked only when the matchmaker's attestation comes with the request (refactor 3.5b)", () => {
    const forged = build({ ranked: true });
    assert.equal(forged.requestedRanked, true);
    assert.equal(forged.ranked, false);
    const attested = build({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
    assert.equal(attested.ranked, true);
    assert.equal(build({ rankedAttestation: getRankedMatchCreateSecret() }).ranked, false, "an attestation alone does not rank a room");
  });
});
