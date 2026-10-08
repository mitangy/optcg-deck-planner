/**
 * Official Q&A from Bandai's FAQ PDFs: one table per set ("Card No. | Card Name | Question | Answer")
 * and a general rules table ("Category | Question | Answer"), parsed from text positions.
 */
import { joinRuns, type PdfItem, type PdfPage } from "./pdf";

export type QaEntry = {
  /** Card number of the row, when the table is per card. */
  cardId: string | null;
  /** Card name, or the category in the general rules table. */
  label: string;
  question: string;
  answer: string;
};

const CARD_ID = /\b(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\b/;
const PAGE_NUMBER = /^\d{1,3}$/;

type Columns = { headerY: number; question: number; answer: number };

function findColumns(page: PdfPage, previous: Columns | null): Columns | null {
  const q = page.find((i) => i.str.trim() === "Question");
  const a = page.find((i) => i.str.trim() === "Answer");
  if (!q || !a) return previous ? { ...previous, headerY: Infinity } : null;
  const split = (q.x + a.x) / 2;
  // Question text is left-aligned under a centred header; its most common start x is the column edge.
  const counts = new Map<number, number>();
  for (const i of page) if (i.y < q.y - 2 && i.x < split) counts.set(Math.round(i.x), (counts.get(Math.round(i.x)) ?? 0) + 1);
  const [questionX] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0] ?? [q.x];
  const answerXs = page.filter((i) => i.y < q.y - 2 && i.x >= split).map((i) => i.x);
  return { headerY: q.y, question: questionX - 5, answer: answerXs.length ? Math.min(...answerXs) - 5 : split };
}

const text = (items: PdfItem[]) => {
  const lines: PdfItem[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0]!.y - it.y) <= 2);
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines
    .map((l) => joinRuns(l))
    .join(" ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/(\w)- (\d)/g, "$1-$2")
    .trim();
};

export function parseQaTable(pages: readonly PdfPage[]): QaEntry[] {
  const entries: QaEntry[] = [];
  let cols: Columns | null = null;
  for (const page of pages) {
    cols = findColumns(page, cols);
    if (!cols) continue;
    const { headerY, question, answer } = cols;
    const body = page.filter((i) => i.y < headerY - 2 && !PAGE_NUMBER.test(i.str.trim()));
    const qItems = body.filter((i) => i.x >= question && i.x < answer).sort((a, b) => b.y - a.y);
    const aItems = body.filter((i) => i.x >= answer);
    const labels = body.filter((i) => i.x < question);
    if (!qItems.length) continue;
    // Rows start where the question column jumps by more than a line and a half.
    const gaps = qItems.slice(1).map((it, n) => qItems[n]!.y - it.y).filter((g) => g > 2);
    const line = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 4)] ?? 12;
    const rows: { top: number; q: PdfItem[]; a: PdfItem[]; label: PdfItem[] }[] = [];
    let lastY = Infinity;
    for (const it of qItems) {
      if (!rows.length || lastY - it.y > line * 1.6) rows.push({ top: it.y, q: [], a: [], label: [] });
      if (Math.abs(lastY - it.y) > 2) lastY = it.y;
      rows[rows.length - 1]!.q.push(it);
    }
    // A row runs from its top line down to the next row's top. Labels sit centred in the row's box,
    // which starts about a line above its text, so their window is shifted up by one line.
    const rowAt = (y: number, shift = 0) => {
      for (let n = rows.length - 1; n >= 0; n--) if (y <= rows[n]!.top + shift + 2) return rows[n]!;
      return rows[0]!;
    };
    for (const it of aItems) rowAt(it.y).a.push(it);
    for (const it of labels) rowAt(it.y, line).label.push(it);
    rows.forEach((r, n) => {
      const q = text(r.q);
      const a = text(r.a);
      if (!r.label.length) {
        const prev = entries[entries.length - 1];
        // A row with no label at the top of a page carries on the previous page's last row.
        if (n === 0 && prev) {
          prev.question = `${prev.question} ${q}`.trim();
          prev.answer = `${prev.answer} ${a}`.trim();
          return;
        }
        entries.push({ cardId: prev?.cardId ?? null, label: prev?.label ?? "", question: q, answer: a });
        return;
      }
      const label = text(r.label);
      const id = CARD_ID.exec(label)?.[1] ?? null;
      entries.push({ cardId: id, label: (id ? label.replace(id, "") : label).trim(), question: q, answer: a });
    });
  }
  return entries.filter((e) => e.question && e.answer);
}

/** FAQ PDFs listed on the official FAQ page, with the set codes each covers. */
export type FaqFile = { url: string; sets: string[]; general: boolean };

export function setCodeOf(cardId: string): string {
  return cardId.startsWith("P-") ? "P" : cardId.split("-")[0]!.toUpperCase();
}

function setsFromFile(name: string): string[] {
  const stem = name.replace(/^(?:qa|faq)_/, "").replace(/\.pdf.*$/, "");
  if (stem.startsWith("promotion")) return ["P"];
  const sets: string[] = [];
  for (const raw of stem.split("_")) {
    // "st-01-st-04" is the range ST01 to ST04.
    const part = raw.replace(/^(op|eb|st|prb)(-?\d+)-\1-?(\d+)$/i, "$1$2-$3");
    const m = /^(op|eb|st|prb)-?(\d{1,2})(?:-(\d{1,2}))?$/i.exec(part) ?? /^(op|eb|st|prb)(\d{1,2})-(eb)(\d{1,2})$/i.exec(part);
    if (!m) continue;
    if (m[3] && /^eb$/i.test(m[3])) {
      sets.push(`${m[1]!.toUpperCase()}${m[2]!.padStart(2, "0")}`, `EB${m[4]!.padStart(2, "0")}`);
      continue;
    }
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    for (let n = from; n <= to; n++) sets.push(`${m[1]!.toUpperCase()}${String(n).padStart(2, "0")}`);
  }
  return sets;
}

export function parseFaqIndex(html: string, baseUrl: string): FaqFile[] {
  const files = new Map<string, FaqFile>();
  for (const m of html.matchAll(/href="([^"]*\/pdf\/((?:qa|faq)_[^"]+?\.pdf)[^"]*)"/gi)) {
    const url = new URL(m[1]!, baseUrl).toString();
    const name = m[2]!.toLowerCase();
    if (files.has(name)) continue;
    const general = name.startsWith("qa_rules");
    files.set(name, { url, sets: general ? [] : setsFromFile(name), general });
  }
  return [...files.values()];
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/[^a-z0-9!+-]+/)
    .filter((w) => w.length > 2);

/**
 * Q&A entries ranked by their query words, rarest words first: each word weighs log(entries / entries containing it),
 * and counts double when it is in the label or question rather than only the answer.
 */
export function searchQa(entries: readonly QaEntry[], query: string, limit = 5): QaEntry[] {
  const terms = [...new Set(words(query))];
  if (!terms.length) return [];
  const docs = entries.map((e) => ({ head: `${e.label} ${e.question}`.toLowerCase(), answer: e.answer.toLowerCase() }));
  const weight = new Map(
    terms.map((t) => [t, Math.log(1 + entries.length / Math.max(1, docs.filter((d) => d.head.includes(t) || d.answer.includes(t)).length))]),
  );
  return entries
    .map((e, i) => {
      const d = docs[i]!;
      const score = terms.reduce((sum, t) => sum + weight.get(t)! * (d.head.includes(t) ? 2 : d.answer.includes(t) ? 1 : 0), 0);
      return { e, i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.e);
}
