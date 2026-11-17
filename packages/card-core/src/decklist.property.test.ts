import { describe, expect } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { CARD_ID_RE } from "./cardId.js";
import { expandDecklist, parseDecklist, toDecklistText } from "./decklist.js";

const NUM_RUNS = 300;

const cardIdArb = fc
  .tuple(
    fc.constantFrom("OP", "ST", "EB", "PRB", "P"),
    fc.integer({ min: 0, max: 15 }),
    fc.integer({ min: 1, max: 130 }),
  )
  .map(([set, s, n]) => `${set}${String(s).padStart(2, "0")}-${String(n).padStart(3, "0")}`);

const fragmentArb = fc.oneof(
  cardIdArb,
  cardIdArb.map((id) => id.toLowerCase()),
  fc.tuple(fc.nat({ max: 12 }), cardIdArb, fc.constantFrom("x", "X", "x ", " x", "")).map(([n, id, x]) => `${n}${x}${id}`),
  fc.tuple(cardIdArb, fc.nat({ max: 12 })).map(([id, n]) => `${id} x${n}`),
  fc.tuple(cardIdArb, fc.nat({ max: 12 }), fc.constantFrom("x", "X", " x")).map(([id, n, x]) => `${id.toLowerCase()}${x}${n}`),
  fc.tuple(fc.integer({ min: 1, max: 6 }), cardIdArb).map(([z, id]) => `${"0".repeat(z)}x${id}`),
  fc.tuple(fc.integer({ min: 1, max: 5000 }), cardIdArb).map(([len, id]) => `${"9".repeat(len)}x${id}`),
  fc.constantFrom("\n", "\r\n", ",", ";", "  ", " ", "# note", "// note", "-", "x", "0", "Nami", "\t"),
  fc.string({ maxLength: 8 }),
);

const decklistishArb = fc.array(fragmentArb, { maxLength: 12 }).map((p) => p.join(""));
const decklistishLinesArb = fc.array(fragmentArb, { maxLength: 12 }).map((p) => p.join("\n"));

const anyText = fc.oneof(fc.string({ maxLength: 60 }), fc.string({ unit: "binary", maxLength: 60 }), decklistishArb, decklistishLinesArb);

describe("parseDecklist properties (#1322)", () => {
  test.prop([anyText], { numRuns: NUM_RUNS * 3 })(
    "parseDecklist on arbitrary text returns positive counts on card-number ids or throws a plain Error (#1322)",
    (text) => {
      let lines: ReturnType<typeof parseDecklist>;
      try {
        lines = parseDecklist(text);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).constructor).toBe(Error);
        return;
      }
      expect(lines.length).toBeGreaterThan(0);
      for (const { cardId, count } of lines) {
        expect(Number.isInteger(count) && count >= 1).toBe(true);
        expect(cardId).toMatch(CARD_ID_RE);
        expect(cardId).toBe(cardId.toUpperCase());
      }
      expect(new Set(lines.map((l) => l.cardId)).size).toBe(lines.length);
    },
  );

  test.prop([cardIdArb, fc.integer({ min: 0, max: 3 }), fc.constantFrom("", "\n4xOP01-016")], { numRuns: NUM_RUNS })(
    "a zero count never yields a zero-count line (#1322)",
    (id, zeros, tail) => {
      const text = `${"0".repeat(zeros + 1)}x${id}${tail}`;
      let lines: ReturnType<typeof parseDecklist> | undefined;
      try {
        lines = parseDecklist(text);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
      // "0xID" is rejected outright, so no 0-count line can come back
      expect(lines).toBeUndefined();
    },
  );

  const deckArb = fc.record({
    ids: fc.array(cardIdArb, { maxLength: 50 }),
    leader: fc.option(cardIdArb, { nil: undefined }),
  });
  // a small id pool makes duplicate lines/ids across the deck likely
  const smallPoolDeckArb = fc.record({
    ids: fc.array(fc.constantFrom("OP01-001", "ST10-012", "EB02-061", "OP05-119"), { minLength: 1, maxLength: 50 }),
    leader: fc.option(fc.constantFrom("OP01-001", "ST10-012", "OP09-001"), { nil: undefined }),
  });

  test.prop([fc.oneof(deckArb, smallPoolDeckArb)], { numRuns: NUM_RUNS })(
    "expandDecklist(parseDecklist(toDecklistText(deck))) gives back the same card multiset (#1322)",
    ({ ids, leader }) => {
      fc.pre(ids.length > 0 || leader !== undefined);
      const expected = [...ids, ...(leader ? [leader] : [])].sort();
      const roundTrip = expandDecklist(parseDecklist(toDecklistText(ids, leader))).sort();
      expect(roundTrip).toEqual(expected);
    },
  );

  test.prop([fc.array(fc.tuple(fc.constantFrom("OP01-001", "ST10-012", "EB02-061"), fc.integer({ min: 1, max: 4 })), { minLength: 1, maxLength: 10 })], {
    numRuns: NUM_RUNS,
  })("the same card on several lines adds its counts up (#1322)", (rows) => {
    const text = rows.map(([id, n]) => `${n}x${id}`).join("\n");
    const want = new Map<string, number>();
    for (const [id, n] of rows) want.set(id, (want.get(id) ?? 0) + n);
    const got = new Map(parseDecklist(text).map((l) => [l.cardId, l.count]));
    expect(got).toEqual(want);
  });
});
