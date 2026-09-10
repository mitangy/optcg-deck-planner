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

  it("rejects bad protocol version on join", () => {
    assert.throws(
      () => parseJoinOptions({ protocolVersion: 99, devUserId: "x" }),
      /protocolVersion/,
    );
  });

  it("defaults create options", () => {
    const c = parseCreateOptions({});
    assert.equal(c.autoSkipMulligan, true);
    assert.equal(typeof c.seed, "number");
  });

  it("parses intent envelope", () => {
    const intent = parseIntentMessage({
      protocolVersion: PROTOCOL_VERSION,
      intent: { type: "end_turn" },
    });
    assert.deepEqual(intent, { type: "end_turn" });
  });
});
