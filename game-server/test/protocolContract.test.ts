import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, parseIntentMessage } from "../src/protocol.js";

// Golden fixtures generated from the engine (packages/rules/protocol-fixtures);
// duel-web and mobile run their own contract tests against the same files.
const dir = fileURLToPath(new URL("../../packages/rules/protocol-fixtures/", import.meta.url));
const load = <T>(file: string): T => JSON.parse(readFileSync(`${dir}${file}`, "utf8")) as T;

type ClientFixture = { name: string; intentType: string; body: { protocolVersion: number; intent: Record<string, unknown> } };
type ServerFixture = { name: string; body: { protocolVersion: number; view?: { legalIntents: Record<string, unknown>[] } } };

const clientFixtures = load<ClientFixture[]>("client-messages.json");
const serverFixtures = load<ServerFixture[]>("server-messages.json");

describe("protocol contract (golden fixtures)", () => {
  it("speaks the protocol version the fixtures were generated for", () => {
    assert.equal(load<{ protocolVersion: number }>("protocol.json").protocolVersion, PROTOCOL_VERSION);
    for (const f of serverFixtures) assert.equal(f.body.protocolVersion, PROTOCOL_VERSION, f.name);
  });

  it("parses every client intent fixture to its intent unchanged", () => {
    for (const f of clientFixtures) {
      assert.deepEqual(parseIntentMessage(f.body), f.body.intent, f.name);
    }
  });

  it("accepts every legal intent a server view offers, sent back unchanged", () => {
    let count = 0;
    for (const f of serverFixtures) {
      for (const intent of f.body.view?.legalIntents ?? []) {
        assert.deepEqual(parseIntentMessage({ protocolVersion: PROTOCOL_VERSION, intent }), intent, f.name);
        count += 1;
      }
    }
    assert.ok(count > 0);
  });

  it("rejects malformed variants of every client intent fixture", () => {
    for (const f of clientFixtures) {
      const { intent } = f.body;
      const { protocolVersion: _v, ...noVersion } = f.body;
      const { intent: _i, ...noIntent } = f.body;
      const { type: _t, ...noType } = intent;
      const bad: Record<string, unknown> = {
        "missing protocolVersion": noVersion,
        "older protocolVersion": { ...f.body, protocolVersion: PROTOCOL_VERSION - 1 },
        "newer protocolVersion": { ...f.body, protocolVersion: PROTOCOL_VERSION + 1 },
        "missing intent": noIntent,
        "intent is not an object": { ...f.body, intent: f.intentType },
        "intent without type": { ...f.body, intent: noType },
        "non-string intent type": { ...f.body, intent: { ...intent, type: 7 } },
      };
      for (const [why, body] of Object.entries(bad)) {
        assert.throws(() => parseIntentMessage(body), (err: Error & { code?: string }) => err.code === "bad_protocol", `${f.name}: ${why}`);
      }
    }
  });
});
