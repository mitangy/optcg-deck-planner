const test = require("node:test");
const assert = require("node:assert");
const { decide, MIN_TEST } = require("../../frontend/scripts/train-embedder/gate.cjs");

const old = { n: 40, top1: 0.5, top5: 0.8 };
const better = (over = {}) => ({ n: MIN_TEST, top1: 0.6, top5: 0.8, ...over });

test("retrain gate publishes a model that wins top1 and holds top5 (#852)", () => {
  assert.strictEqual(decide(old, better()).publish, true);
});

test("retrain gate refuses a test set smaller than the minimum (#852)", () => {
  assert.strictEqual(decide(old, better({ n: MIN_TEST - 1 })).publish, false);
});

test("retrain gate refuses a tie on top1 (#852)", () => {
  assert.strictEqual(decide(old, better({ top1: 0.5 })).publish, false);
});

test("retrain gate refuses a top5 regression even when top1 improves (#852)", () => {
  assert.strictEqual(decide(old, better({ top5: 0.79 })).publish, false);
});

test("retrain gate refuses when the old model's metrics are missing (#852)", () => {
  assert.strictEqual(decide(undefined, better()).publish, false);
});
