import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  parseCreateOptions,
  parseIntentMessage,
  parseJoinOptions,
} from "../src/protocol.js";

describe("protocol parsers", () => {
  it("parses join options", () => {
    const j = parseJoinOptions({
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "dev-1",
      preferredSeat: 1,
      secret: "s",
    });
    assert.equal(j.devUserId, "dev-1");
    assert.equal(j.preferredSeat, 1);
    assert.equal(j.secret, "s");
  });

  it("parses spectator join role", () => {
    const j = parseJoinOptions({
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "watch",
      role: "spectator",
      preferredSeat: 0,
    });
    assert.equal(j.role, "spectator");
    assert.equal(j.preferredSeat, 0);
  });

  it("rejects join without gameToken or devUserId", () => {
    assert.throws(
      () => parseJoinOptions({ protocolVersion: PROTOCOL_VERSION }),
      /gameToken or devUserId/,
    );
  });

  it("parses join options with seat deck", () => {
    const j = parseJoinOptions({
      protocolVersion: PROTOCOL_VERSION,
      devUserId: "dev-1",
      preferredSeat: 0,
      deck: { leaderId: "ST01-001", deck: ["ST01-003", "ST01-006"] },
    });
    assert.equal(j.deck?.leaderId, "ST01-001");
    assert.deepEqual(j.deck?.deck, ["ST01-003", "ST01-006"]);
  });

  it("defaults create options", () => {
    const c = parseCreateOptions({});
    assert.equal(c.autoSkipMulligan, true);
    assert.equal(c.ranked, false);
    assert.equal(typeof c.seed, "number");
  });

  it("treats ranked as an explicit request rather than the default", () => {
    assert.equal(parseCreateOptions({ ranked: false }).ranked, false);
    assert.equal(parseCreateOptions({ ranked: true }).ranked, true);
  });

  it("parses intent envelope", () => {
    const intent = parseIntentMessage({
      protocolVersion: PROTOCOL_VERSION,
      intent: { type: "end_turn" },
    });
    assert.deepEqual(intent, { type: "end_turn" });
  });
});
