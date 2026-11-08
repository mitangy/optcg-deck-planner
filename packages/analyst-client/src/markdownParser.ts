/**
 * A small Markdown subset for assistant answers, parsed to a tree that Markdown.tsx renders
 * as React elements (never as HTML strings): paragraphs, headings, bullet and numbered lists,
 * **bold**, *italic*, `code`, fenced code blocks, pipe tables, rules and http(s) links.
 * Anything else, HTML included, stays literal text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "code"; lang: string; v: string }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** The URL if it is an absolute http(s) link, else null (javascript:, data:, relative…). */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

const BARE_URL = /^https?:\/\/[^\s<>()\[\]]+/;

function pushText(out: Inline[], v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

/** Finds the closing `marker` after `from`, with non-space content before it. */
function closing(s: string, marker: string, from: number): number {
  let j = s.indexOf(marker, from);
  while (j >= 0) {
    if (j > from && s[j - 1] !== " ") return j;
    j = s.indexOf(marker, j + 1);
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    const rest = s.slice(i);
    if (ch === "\\" && i + 1 < s.length && /[\\`*_\[\]()#|>-]/.test(s[i + 1]!)) {
      pushText(out, s[i + 1]!);
      i += 2;
      continue;
    }
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        out.push({ t: "code", v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && s[i + 1] === ch && s[i + 2] && s[i + 2] !== " ") {
      const j = closing(s, ch + ch, i + 2);
      if (j > 0) {
        out.push({ t: "b", c: parseInline(s.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && s[i + 1] && s[i + 1] !== " " && s[i + 1] !== ch) {
      // `_` only opens at a word start, so snake_case ids stay as they are.
      const opens = ch === "*" || i === 0 || /[\s(]/.test(s[i - 1]!);
      const j = opens ? closing(s, ch, i + 1) : -1;
      if (j > 0 && (ch === "*" || j + 1 >= s.length || !/\w/.test(s[j + 1]!))) {
        out.push({ t: "i", c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(([^()\s]+(?:\([^()\s]*\))?[^()\s]*)(?:\s+"[^"]*")?\)/.exec(rest);
      if (m) {
        const href = safeHref(m[2]!);
        const label = parseInline(m[1]!);
        if (href) out.push({ t: "a", href, c: label });
        else for (const node of label) node.t === "text" ? pushText(out, node.v) : out.push(node);
        i += m[0].length;
        continue;
      }
    }
    if (ch === "h" && (i === 0 || /[\s(]/.test(s[i - 1]!))) {
      const m = BARE_URL.exec(rest);
      if (m) {
        const url = m[0].replace(/[.,;:!?'"]+$/, "");
        const href = safeHref(url);
        if (href) {
          out.push({ t: "a", href, c: [{ t: "text", v: url }] });
          i += url.length;
          continue;
        }
      }
    }
    pushText(out, ch);
    i++;
  }
  return out;
}

/** Soft line breaks inside a paragraph render as <br>, as chat users expect. */
function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, k) => {
    if (k) out.push({ t: "br" });
    out.push(...parseInline(l.trim()));
  });
  return out;
}

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i]!;
  const sep = lines[i + 1];
  if (sep === undefined || !head.includes("|") || !TABLE_SEP.test(sep) || !sep.includes("-")) return false;
  return sep.includes("|") || splitRow(head).length === 1;
}

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i]!;
  return FENCE.test(l) || HEADING.test(l) || RULE.test(l) || BULLET.test(l) || NUMBERED.test(l) || isTableStart(lines, i);
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i]!.trim().startsWith(fence[1]!) && FENCE.test(lines[i]!))) body.push(lines[i++]!);
      i++; // closing fence (or end of a still-streaming block)
      blocks.push({ t: "code", lang: fence[2] ?? "", v: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: "h", level: heading[1]!.length, c: parseInline(heading[2]!) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) {
        const cells = splitRow(lines[i]!).map(parseInline);
        while (cells.length < head.length) cells.push([]);
        rows.push(cells.slice(0, head.length));
        i++;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = ordered ? NUMBERED.exec(l) : BULLET.exec(l);
        if (m) {
          items.push([ordered ? m[2]! : m[1]!]);
          i++;
        } else if (l.trim() && /^\s+/.test(l) && (!startsBlock(lines, i) || BULLET.test(l) || NUMBERED.test(l))) {
          // An indented line continues the item above; a nested list of the other kind stays as its text.
          items[items.length - 1]!.push(l);
          i++;
        } else break;
      }
      const parsed = items.map(inlineLines);
      blocks.push(ordered ? { t: "ol", start: Number(numbered![1]), items: parsed } : { t: "ul", items: parsed });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++]!);
    blocks.push({ t: "p", c: inlineLines(para) });
  }
  return blocks;
}
