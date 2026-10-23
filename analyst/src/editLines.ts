/** The +N / -N card lines a written answer lists ("+2x OP01-016", "-4 Komachiyo (OP01-010)"), as deck changes. */

export type Edit = { sign: "+" | "-"; copies: number; id: string };

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

/** Every edit line in an answer, in order. */
export function parseEditLines(answer: string): Edit[] {
  return answer.split("\n").flatMap(lineEdits);
}
