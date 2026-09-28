/**
 * Text normalization and ability segmentation for the offline card-text compiler.
 *
 * Bracketed names, braced traits and quoted substrings are replaced with
 * placeholders so sentence splitting and pattern matching cannot be confused by
 * periods or keywords inside names ("[Dr. Kureha]", "[Monkey.D.Luffy]").
 */

export interface Placeholders {
  names: string[];
  traits: string[];
  quotes: string[];
}

export interface Segment {
  /** Header tags in order, e.g. ["DON!! x1", "When Attacking"]. */
  tags: string[];
  /** Additional windows joined with "/" to the first timing tag. */
  body: string;
  raw: string;
}

const TIMING_TAGS = [
  "On Play",
  "When Attacking",
  "Activate: Main",
  "Activate:Main",
  "Main",
  "Counter",
  "Trigger",
  "On KO",
  "On Block",
  "End of Your Turn",
  "End of Your Opponent's Turn",
  "On Your Opponent's Attack",
  "Your Turn",
  "Opponent's Turn",
  "Once Per Turn",
  "Start of Your Turn",
];
const KEYWORD_TAGS = ["Blocker", "Rush", "Rush: Character", "Double Attack", "Banish", "Unblockable"];

export function isKeywordTag(tag: string): boolean {
  return KEYWORD_TAGS.includes(tag);
}

export function isHeaderTag(tag: string): boolean {
  return TIMING_TAGS.includes(tag) || /^DON!! x\d+$/.test(tag) || /^RDON \d+$/.test(tag);
}

const CIRCLED: Record<string, number> = {};
"➀➁➂➃➄➅➆➇➈➉".split("").forEach((ch, index) => { CIRCLED[ch] = index + 1; });
"①②③④⑤⑥⑦⑧⑨⑩".split("").forEach((ch, index) => { CIRCLED[ch] = index + 1; });

export function normalizeText(input: string): string {
  let text = input
    .replace(/[−–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/[＜]/g, "<")
    .replace(/[＞]/g, ">")
    .replace(/\byour have\b/gi, "you have")
    .replace(/\byou can (trash|rest|return|place|add|give)\b/gi, "you may $1")
    .replace(/\byour opponent must (place|trash|return)\b/gi, "your opponent $1s")
    .replace(/\bK\.O\.'s\b/g, "KOs")
    .replace(/"(Strike|Slash|Special|Wisdom|Ranged)" attribute/gi, "<$1> attribute")
    .replace(/"(Strike|Slash|Special|Wisdom|Ranged)" or "(Strike|Slash|Special|Wisdom|Ranged)" attribute/gi, "<$1> or <$2> attribute");
  // Remove reminder text; repeat for nested parentheses.
  for (let pass = 0; pass < 3; pass += 1) text = text.replace(/\s*\([^()]*\)/g, "");
  text = text.replace(/[➀-➉①-⑩]/g, (ch) => ` [RDON ${CIRCLED[ch]}] `);
  text = text.replace(/\[On K\.O\.\]/g, "[On KO]");
  text = text.replace(/K\.O\.'d/g, "KO'd").replace(/K\.O\./g, "KO");
  text = text.replace(/\[Activate:\s*Main\]/g, "[Activate: Main]");
  text = text.replace(/DON!!\s*-\s*(\d+)/g, "DON!! -$1");
  text = text.replace(/\[DON!!\s*x\s*(\d+)\]/gi, "[DON!! x$1]");
  text = text.replace(/\s+/g, " ").trim();
  // A leading ":" is left behind when a cost symbol (➀) precedes it.
  text = text.replace(/\] : /g, "] ").replace(/\] :/g, "] ");
  return text;
}

/** Replace names/traits/quotes with placeholder tokens. Timing/keyword tags stay bracketed. */
export function protect(text: string): { text: string; ph: Placeholders } {
  const ph: Placeholders = { names: [], traits: [], quotes: [] };
  let out = text.replace(/\{([^}]*)\}/g, (_m, trait: string) => { ph.traits.push(trait.trim()); return `§T${ph.traits.length - 1}§`; });
  out = out.replace(/"([^"]*)"/g, (_m, quote: string) => { ph.quotes.push(quote.trim()); return `§Q${ph.quotes.length - 1}§`; });
  out = out.replace(/\[([^\]]*)\]/g, (match, inner: string) => {
    const tag = inner.trim();
    if (isHeaderTag(tag) || isKeywordTag(tag) || tag === "Trigger") return `[${tag}]`;
    ph.names.push(tag);
    return `§N${ph.names.length - 1}§`;
  });
  return { text: out, ph };
}

/**
 * Split protected text into abilities. A header tag starts a new ability when
 * it begins the text or follows a sentence end / another header tag / "/".
 */
export function segment(text: string): Segment[] {
  const segments: Segment[] = [];
  const tagRe = /\[([^\]]+)\]/g;
  type Tok = { tag?: string; text?: string; start: number; end: number };
  const toks: Tok[] = [];
  let last = 0;
  for (const m of text.matchAll(tagRe)) {
    if (m.index! > last) toks.push({ text: text.slice(last, m.index), start: last, end: m.index! });
    toks.push({ tag: m[1]!, start: m.index!, end: m.index! + m[0].length });
    last = m.index! + m[0].length;
  }
  if (last < text.length) toks.push({ text: text.slice(last), start: last, end: text.length });

  let current: { tags: string[]; parts: string[]; start: number } | null = null;
  const flush = (end: number) => {
    if (!current) return;
    const body = current.parts.join("").trim();
    segments.push({ tags: current.tags, body, raw: text.slice(current.start, end).trim() });
    current = null;
  };
  for (const tok of toks) {
    const isTag = tok.tag !== undefined && (isHeaderTag(tok.tag) || isKeywordTag(tok.tag));
    if (!isTag) {
      // Text after a bare keyword ("[Rush] When ...") starts its own untimed ability.
      if (current && current.tags.length > 0 && current.tags.every(isKeywordTag) && current.parts.join("").trim() === "" && tok.text !== undefined && tok.text.trim() !== "") {
        flush(tok.start);
      }
      if (!current) current = { tags: [], parts: [], start: tok.start };
      current.parts.push(tok.tag !== undefined ? `[${tok.tag}]` : tok.text!);
      continue;
    }
    const tag = tok.tag!;
    if (!current) { current = { tags: [tag], parts: [], start: tok.start }; continue; }
    const body = current.parts.join("").trim();
    const inHeader = body === "" || body === "/";
    if (inHeader && current.tags.length > 0) {
      const keywordOnly = current.tags.every(isKeywordTag);
      if (keywordOnly) { flush(tok.start); current = { tags: [tag], parts: [], start: tok.start }; continue; }
      current.tags.push(tag);
      current.parts = [];
      continue;
    }
    if (inHeader) { current.tags.push(tag); current.parts = []; continue; }
    if (/\.$/.test(body)) { flush(tok.start); current = { tags: [tag], parts: [], start: tok.start }; continue; }
    current.parts.push(`[${tag}]`);
  }
  flush(text.length);
  return segments;
}

/** Split an effect body into sentences, respecting protected placeholders. */
export function sentences(body: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index]!;
    buf += ch;
    if (ch === "." && (index + 1 === body.length || body[index + 1] === " ")) {
      out.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s !== "." && s !== "");
}

export function restoreNames(text: string, ph: Placeholders): string {
  return text
    .replace(/§N(\d+)§/g, (_m, i) => `[${ph.names[Number(i)]}]`)
    .replace(/§T(\d+)§/g, (_m, i) => `{${ph.traits[Number(i)]}}`)
    .replace(/§Q(\d+)§/g, (_m, i) => `"${ph.quotes[Number(i)]}"`);
}
