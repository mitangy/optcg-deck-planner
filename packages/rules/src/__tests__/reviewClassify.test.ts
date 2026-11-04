import { describe, expect, it } from "vitest";
import { REVIEW_THRESHOLDS, accuracyScore, classifyLoss, classifyMove, isGoodTurn, stableJson, worseClass } from "../review/classify.js";

describe("review classification (#967)", () => {
  it("each class ends exactly at its threshold: 1, 3, 7, 12 and 22 points (#967)", () => {
    const t = REVIEW_THRESHOLDS;
    expect([t.best, t.excellent, t.good, t.inaccuracy, t.mistake]).toEqual([1, 3, 7, 12, 22]);
    expect(classifyLoss(0)).toBe("best");
    expect(classifyLoss(1)).toBe("best");
    expect(classifyLoss(1.01)).toBe("excellent");
    expect(classifyLoss(3)).toBe("excellent");
    expect(classifyLoss(3.01)).toBe("good");
    expect(classifyLoss(7)).toBe("good");
    expect(classifyLoss(8)).toBe("inaccuracy");
    expect(classifyLoss(12)).toBe("inaccuracy");
    expect(classifyLoss(12.01)).toBe("mistake");
    expect(classifyLoss(22)).toBe("mistake");
    expect(classifyLoss(22.01)).toBe("blunder");
    expect(classifyLoss(100)).toBe("blunder");
  });

  it("loss is the best option minus the played one, so a worse move than the best is penalised (#967)", () => {
    // Played 50 while another option had 60: a 10-point loss, an inaccuracy.
    expect(classifyMove(50, [60, 40])).toEqual({ loss: 10, cls: "inaccuracy" });
    // Played the top option: no loss, never negative.
    expect(classifyMove(60, [50, 40]).loss).toBe(0);
    expect(classifyMove(95, [10]).loss).toBe(0);
  });

  it("Great needs the played move to be best and the next-best other option 10 points worse (#967)", () => {
    expect(classifyMove(70, [60, 20]).cls).toBe("great");
    expect(classifyMove(70, [60.5, 20]).cls).toBe("best");
    expect(classifyMove(70, [61]).cls).toBe("best");
    // Within a point of the top is still "best", but not Great: the real top option is right there.
    expect(classifyMove(60, [60.5, 10]).cls).toBe("best");
    // A single ranked option has no gap to measure.
    expect(classifyMove(60, []).cls).toBe("best");
  });

  it("accuracy score is 100 at no loss and falls with every extra point of loss (#967)", () => {
    expect(accuracyScore(0)).toBe(100);
    let prev = 100;
    for (const loss of [1, 3, 7, 12, 22, 50, 100]) {
      const s = accuracyScore(loss);
      expect(s).toBeLessThan(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      prev = s;
    }
    expect(accuracyScore(22)).toBeGreaterThan(30);
    expect(accuracyScore(22)).toBeLessThan(45);
  });

  it("a good turn has no Inaccuracy or worse and gains 8 points of win probability (#967)", () => {
    expect(isGoodTurn("good", 40, 48)).toBe(true);
    expect(isGoodTurn(null, 40, 48)).toBe(true);
    expect(isGoodTurn("great", 40, 47.9)).toBe(false);
    expect(isGoodTurn("inaccuracy", 40, 80)).toBe(false);
    expect(isGoodTurn("blunder", 40, 80)).toBe(false);
    // Losing ground is not a good turn even with clean play; a gain is measured as next minus this.
    expect(isGoodTurn("best", 48, 40)).toBe(false);
  });

  it("worst class of a turn is the most severe one, and best and great do not outrank each other (#967)", () => {
    expect(worseClass(null, "good")).toBe("good");
    expect(worseClass("mistake", "good")).toBe("mistake");
    expect(worseClass("good", "mistake")).toBe("mistake");
    expect(worseClass("good", null)).toBe("good");
    expect(worseClass("best", "great")).toBe("best");
  });

  it("stable JSON ignores key order and undefined fields (#967)", () => {
    expect(stableJson({ a: 1, b: { c: [1, { y: 1, x: 2 }] }, z: undefined })).toBe(stableJson({ b: { c: [1, { x: 2, y: 1 }] }, a: 1 }));
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }));
  });
});
