/** Official card errata (text changes), parsed from Bandai's errata page. */

export type Erratum = { cardId: string; name: string; date: string | null; before: string; after: string };

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

export function parseErrata(html: string): Erratum[] {
  const out: Erratum[] = [];
  let date: string | null = null;
  for (const m of html.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>|<h5\b[^>]*>([\s\S]*?)<\/h5>([\s\S]*?)<\/dl>/gi)) {
    if (m[1] !== undefined) {
      date = plain(m[1]);
      continue;
    }
    // Older entries put the date in the card heading: "February 17, 2023<br>OP01-016 Nami".
    const lines = plain(m[2]!).split("\n");
    const id = lines.map((l) => /^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\s*(.*)$/.exec(l)).find(Boolean);
    if (!id) continue;
    const ownDate = lines.find((l) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(l));
    const fields = new Map<string, string>();
    for (const f of m[3]!.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
      fields.set(plain(f[1]!).replace(/:$/, "").toLowerCase(), plain(f[2]!));
    }
    const after = fields.get("after");
    // Alt-art printings repeat the same erratum.
    if (!after || out.some((e) => e.cardId === id[1] && e.after === after)) continue;
    out.push({ cardId: id[1]!, name: id[2]!, date: ownDate ?? date, before: fields.get("before") ?? "", after });
  }
  return out;
}
