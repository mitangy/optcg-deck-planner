/**
 * OPTCGSim / planner-style decklist parser (client-side).
 * Accepts the same shapes as backend `parse_decklist`.
 */

export type ParsedDeckLine = { cardId: string; count: number };

const LINE_RE =
  /^\s*(?:(\d+)\s*[xX]\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)\s*(.*)?$/;
const TOKEN_RE = /(?:(\d+)\s*[xX]?\s*)?([A-Za-z0-9]+-\d+[A-Za-z]?)/gi;

export function parseDecklist(text: string): ParsedDeckLine[] {
  const counts = new Map<string, number>();
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) throw new Error("No cards found in decklist");

  const lines = raw.split("\n").map((l) => l.trim());
  const expanded: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    if (LINE_RE.test(line) && (line.match(/-/g) ?? []).length <= 1) {
      expanded.push(line);
      continue;
    }
    const parts = line.split(/[,;]+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1 && line.includes(" ") && !LINE_RE.test(line)) {
      expanded.push(line);
    } else {
      expanded.push(...parts);
    }
  }

  for (const line of expanded) {
    // Trailing qty: "ST01-014 x4" / "ST01-014x4"
    const trailing = line.match(
      /^\s*([A-Za-z0-9]+-\d+[A-Za-z]?)\s*[xX]\s*(\d+)\s*(.*)?$/,
    );
    if (trailing) {
      const id = trailing[1].toUpperCase();
      const qty = Number(trailing[2]);
      if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity on ${line}`);
      counts.set(id, (counts.get(id) ?? 0) + qty);
      continue;
    }
    const m = line.match(LINE_RE);
    if (m) {
      const qty = m[1] ? Number(m[1]) : 1;
      const id = m[2].toUpperCase();
      if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity on ${line}`);
      counts.set(id, (counts.get(id) ?? 0) + qty);
      continue;
    }
    TOKEN_RE.lastIndex = 0;
    let hit = false;
    let tm: RegExpExecArray | null;
    while ((tm = TOKEN_RE.exec(line)) !== null) {
      hit = true;
      const qty = tm[1] ? Number(tm[1]) : 1;
      const id = tm[2].toUpperCase();
      if (!Number.isFinite(qty) || qty < 1) throw new Error(`Bad quantity for ${id}`);
      counts.set(id, (counts.get(id) ?? 0) + qty);
    }
    if (!hit) throw new Error(`Could not parse line: ${line}`);
  }

  if (counts.size === 0) throw new Error("No cards found in decklist");
  return [...counts.entries()].map(([cardId, count]) => ({ cardId, count }));
}

export function expandDecklist(lines: ParsedDeckLine[]): string[] {
  const out: string[] = [];
  for (const { cardId, count } of lines) {
    for (let i = 0; i < count; i++) out.push(cardId);
  }
  return out;
}

export function toDecklistText(cardIds: string[], leaderId?: string): string {
  const counts = new Map<string, number>();
  if (leaderId) counts.set(leaderId, 1);
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, n]) => `${n}x${id}`)
    .join("\n");
}
