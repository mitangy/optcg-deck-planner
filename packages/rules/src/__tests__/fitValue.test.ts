import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES } from "../bot/features.js";
import type { ValueWeights } from "../bot/valueModel.js";
import { compareModels, expandInputs, refitDecision, type ModelScore, type Sample } from "../sim/fitValue.js";

const names = [...FEATURE_NAMES];
const score = (logLoss: number | null, over: Partial<ModelScore> = {}): ModelScore => ({ names, logLoss, accuracy: 0.7, ...over });
const ok = { heldOutSamples: 5000 };

describe("refitDecision (#915)", () => {
  it("accepts a candidate that beats the committed weights by at least minGain (#915)", () => {
    expect(refitDecision(score(0.53), score(0.52), ok).accept).toBe(true);
  });

  it("rejects a gain below minGain, and honours a custom minGain (#915)", () => {
    expect(refitDecision(score(0.53), score(0.5295), ok).accept).toBe(false);
    expect(refitDecision(score(0.53), score(0.52), { ...ok, minGain: 0.02 }).accept).toBe(false);
  });

  it("rejects a candidate that is worse than the committed weights (#915)", () => {
    expect(refitDecision(score(0.52), score(0.53), ok).accept).toBe(false);
  });

  it("rejects when there are too few held-out samples, even for a big gain (#915)", () => {
    expect(refitDecision(score(0.6), score(0.4), { heldOutSamples: 1999 }).accept).toBe(false);
    expect(refitDecision(score(0.6), score(0.4), { heldOutSamples: 2000 }).accept).toBe(true);
  });

  it("accepts when the committed weights are stale, but not on too few samples (#915)", () => {
    const stale = score(null, { names: names.slice(1) });
    expect(refitDecision(stale, score(0.6), ok).accept).toBe(true);
    expect(refitDecision(stale, score(0.6), { heldOutSamples: 10 }).accept).toBe(false);
  });

  it("rejects a candidate whose names do not match the feature list (#915)", () => {
    expect(refitDecision(score(0.6), score(0.4, { names: names.slice(1) }), ok).accept).toBe(false);
    expect(refitDecision(score(null, { names: [] }), score(0.4, { names: [...names].reverse() }), ok).accept).toBe(false);
  });
});

describe("compareModels (#915)", () => {
  const sample = (v: number, y: 0 | 1): Sample => ({ x: names.map((_, j) => (j === 0 ? v : 0)), y, hand: 0, turn: 1, game: 0 });
  const test = [sample(1, 1), sample(1, 1), sample(-1, 0), sample(-1, 0), sample(1, 0)];
  const weights = (w0: number): ValueWeights => ({ names, weights: names.map((_, j) => (j === 0 ? w0 : 0)), bias: 0 });

  it("scores the committed weights and the candidate separately on the same held-out samples (#915)", () => {
    const r = compareModels(test, weights(-2), weights(2));
    expect(r.candidate.logLoss!).toBeLessThan(r.current.logLoss!);
    expect(r.candidate.accuracy).toBeCloseTo(0.8);
    expect(r.current.accuracy).toBeCloseTo(0.2);
  });

  it("does not score weights whose names are stale (#915)", () => {
    const r = compareModels(test, { ...weights(2), names: names.slice(1) }, weights(2));
    expect(r.current.logLoss).toBeNull();
    expect(r.candidate.logLoss).not.toBeNull();
  });
});

describe("expandInputs (#915)", () => {
  it("--in takes a directory of downloaded artifacts: every .jsonl inside, nested, nothing else (#915)", () => {
    const dir = mkdtempSync(join(tmpdir(), "fitvalue-"));
    mkdirSync(join(dir, "123"));
    writeFileSync(join(dir, "123", "a.jsonl"), "");
    writeFileSync(join(dir, "123", "notes.txt"), "");
    writeFileSync(join(dir, "b.jsonl"), "");
    const single = join(dir, "b.jsonl");
    expect(expandInputs([dir])).toEqual([join(dir, "123", "a.jsonl"), join(dir, "b.jsonl")]);
    expect(expandInputs([single])).toEqual([single]);
  });
});
