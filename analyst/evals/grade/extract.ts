/** Programmatic facts read out of an answer: percentages, game counts, card numbers, numbers and +N/-N edit lines. */

export const CARD_ID = /(?<![A-Z0-9])(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\b/g; // "4xOP01-006" counts: the x is not a capital

export type Percent = { value: number; /** Written without a decimal point, as in "78%". */ whole: boolean };
export type Edit = { sign: "+" | "-"; copies: number; id: string };

export type Facts = {
  percents: Percent[];
  games: number[];
  wins: number[];
  cardIds: string[];
  /** Every number in the answer with card numbers left out; number words one to ten count too. */
  numbers: number[];
  edits: Edit[];
};

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Two percentages agree when they differ by at most `tol`. */
export function closePercent(a: number, c: number, tol: number): boolean {
  return Math.abs(a - c) <= tol + 1e-9;
}

const ID = "P-\\d{3}|[A-Z]{2,4}\\d{2}-\\d{3}";
const SIGN = "[+\\-\\u2212\\u2013]"; // plus, hyphen, minus sign U+2212, en dash
/** "+2x OP01-016", "-4 Komachiyo (OP01-010)": a sign, a count, then the card number (bare, or in parentheses after the card name). */
const EDIT = new RegExp(`(${SIGN})\\s*(\\d{1,2})(?![\\d,.]\\d)\\s*x?\\s*(?:(${ID})|[A-Z][^()\\n/,;]{0,49}?\\(\\s*(${ID})\\s*\\))`, "y");
const NEXT_EDIT = new RegExp(`\\s*[/,;]\\s*(?=${SIGN}\\s*\\d)`, "g");

/** Edits on one line: the line must start with the edit (after a list marker or bold), later ones follow a "/", "," or ";" as in a swap. */
function lineEdits(raw: string): Edit[] {
  const line = raw
    .replace(/(\*\*|__|`)/g, "")
    .trim()
    .replace(new RegExp(`^(?:[-*\u2022]|\\d+[.)])\\s+(?=${SIGN}\\s*\\d)`), "");
  const out: Edit[] = [];
  let at = 0;
  for (;;) {
    EDIT.lastIndex = at;
    const m = EDIT.exec(line);
    if (!m) break;
    out.push({ sign: m[1] === "+" ? "+" : "-", copies: Number(m[2]), id: (m[3] ?? m[4])! });
    NEXT_EDIT.lastIndex = EDIT.lastIndex;
    const next = NEXT_EDIT.exec(line);
    if (!next) break;
    at = next.index + next[0].length;
  }
  return out;
}

export function extractFacts(answer: string): Facts {
  const percents = [...answer.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => ({ value: Number(m[1]), whole: !m[1]!.includes(".") }));
  const games = [...answer.matchAll(/(\d[\d,]*)\s+games?\b/gi)].map((m) => num(m[1]!));
  const wins = [...answer.matchAll(/(\d[\d,]*)\s+wins?\b/gi)].map((m) => num(m[1]!));
  const cardIds = [...new Set([...answer.matchAll(CARD_ID)].map((m) => m[1]!))];
  const bare = answer.replace(CARD_ID, " ");
  const numbers = [
    ...[...bare.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => num(m[0])),
    ...[...bare.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g)].map((m) => WORDS[m[1]!]!),
  ];
  const edits = answer.split("\n").flatMap(lineEdits);
  return { percents, games, wins, cardIds, numbers, edits };
}
