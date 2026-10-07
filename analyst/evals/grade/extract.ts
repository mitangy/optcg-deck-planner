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
  const edits = [...answer.matchAll(/^\s*([+-])\s*(\d+)\s*x?\s*(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})/gm)].map((m) => ({
    sign: m[1] as "+" | "-",
    copies: Number(m[2]),
    id: m[3]!,
  }));
  return { percents, games, wins, cardIds, numbers, edits };
}
