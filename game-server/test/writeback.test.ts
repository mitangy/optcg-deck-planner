import assert from "node:assert/strict";
import { LatestOnlySender } from "../src/writeback.js";

describe("LatestOnlySender", () => {
  it("sends one at a time and skips to the newest snapshot (#316)", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const sender = new LatestOnlySender<string>(async (payload) => {
      sent.push(payload);
      if (payload === "turn 1") await new Promise<void>((r) => { release = r; });
    });
    const done = sender.push("turn 1");
    void sender.push("turn 2");
    void sender.push("turn 3");
    release();
    await done;
    assert.deepEqual(sent, ["turn 1", "turn 3"]);
  });

  it("a failed send doesn't stop the next snapshot (#316)", async () => {
    const sent: string[] = [];
    const errors: unknown[] = [];
    const sender = new LatestOnlySender<string>(async (payload) => {
      if (payload === "turn 1") throw new Error("API down");
      sent.push(payload);
    }, (e) => errors.push(e));
    await sender.push("turn 1");
    await sender.push("turn 2");
    assert.deepEqual(sent, ["turn 2"]);
    assert.equal(errors.length, 1);
  });
});
