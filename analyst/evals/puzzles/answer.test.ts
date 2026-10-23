import { describe, expect, it } from "vitest";
import { gradeAnswer, normalizeCard, parseAnswer } from "./answer";
import type { Gold } from "./types";

const known = [
  { id: "ST01-003", name: "Karoo" },
  { id: "ST01-009", name: "Nefeltari Vivi" },
  { id: "OP01-025", name: "Roronoa Zoro" },
];
const set = (value: string[]): Gold => ({ key: "cards", mode: "set", value });
const answer = (json: string) => parseAnswer(`Some reasoning.\n\`\`\`json\n${json}\n\`\`\``);

describe("reading the model's answer", () => {
  it("takes the last JSON block when the reply has several (#677)", () => {
    const text = 'First idea:\n```json\n{"power": 5000}\n```\nOn second thought:\n```json\n{"power": 7000}\n```\n';
    expect(parseAnswer(text)).toMatchObject({ ok: true, value: { power: 7000 } });
  });

  it("reads a bare JSON object when the reply has no fence (#677)", () => {
    expect(parseAnswer('The answer is {"power": 6000}, I think.')).toMatchObject({ ok: true, value: { power: 6000 } });
  });

  it("counts a reply with no parseable JSON as no answer (#677)", () => {
    expect(parseAnswer("It is 6000.").ok).toBe(false);
    expect(parseAnswer("```json\n{power: 6000\n```").ok).toBe(false);
  });
});

describe("grading an answer exactly", () => {
  it("marks a list that differs from the gold wrong even when it is as long (#677)", () => {
    const gold = set(["ST01-003", "ST01-009"]);
    expect(gradeAnswer(gold, answer('{"cards": ["ST01-003", "OP01-025"]}'), known).correct).toBe(false);
    expect(gradeAnswer(gold, answer('{"cards": ["ST01-003"]}'), known).correct).toBe(false);
    expect(gradeAnswer(gold, answer('{"cards": ["ST01-003", "ST01-009", "OP01-025"]}'), known).correct).toBe(false);
  });

  it("marks the right list right in any order, with a repeated card, or written as names (#677)", () => {
    const gold = set(["ST01-003", "ST01-009"]);
    expect(gradeAnswer(gold, answer('{"cards": ["ST01-009", "ST01-003"]}'), known).correct).toBe(true);
    expect(gradeAnswer(gold, answer('{"cards": ["ST01-003", "ST01-009", "ST01-003"]}'), known).correct).toBe(true);
    expect(gradeAnswer(gold, answer('{"cards": ["Nefeltari Vivi (ST01-009)", "karoo"]}'), known).correct).toBe(true);
  });

  it("counts the copies of a card when the gold is a multiset (#677)", () => {
    const gold: Gold = { key: "hand", mode: "multiset", value: ["ST01-003", "ST01-003"] };
    expect(gradeAnswer(gold, answer('{"hand": ["ST01-003"]}'), known).correct).toBe(false);
    expect(gradeAnswer(gold, answer('{"hand": ["ST01-003", "ST01-003"]}'), known).correct).toBe(true);
  });

  it("grades a number exactly, not near (#677)", () => {
    const gold: Gold = { key: "power", mode: "number", value: 7000 };
    expect(gradeAnswer(gold, answer('{"power": 7000}')).correct).toBe(true);
    expect(gradeAnswer(gold, answer('{"power": "7,000"}')).correct).toBe(true);
    expect(gradeAnswer(gold, answer('{"power": 7001}')).correct).toBe(false);
    expect(gradeAnswer(gold, answer('{"power": 6000}')).correct).toBe(false);
    expect(gradeAnswer(gold, answer('{"power": "about 7000"}')).correct).toBe(false);
  });

  it("marks an unparseable reply wrong (#677)", () => {
    const graded = gradeAnswer({ key: "power", mode: "number", value: 0 }, parseAnswer("zero"));
    expect(graded).toMatchObject({ correct: false, given: "(no answer)" });
  });

  it("turns a card name into the card number only when one card of the puzzle has it (#677)", () => {
    expect(normalizeCard("Karoo", known)).toBe("ST01-003");
    expect(normalizeCard("Karoo", [...known, { id: "EB02-001", name: "Karoo" }])).toBe("karoo");
    expect(normalizeCard("st01-009", known)).toBe("ST01-009");
  });
});
