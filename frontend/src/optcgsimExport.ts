/** OPTCGSim decklist export (clipboard / .txt) helpers. */

export type OptcgSimExportCard = {
  card_id: string;
  needed: number;
  card_type?: string | null;
  section?: string | null;
};

export type OptcgSimExport = {
  /** Lines matching OPTCGSim “Copy Deck List to Clipboard” (`4xOP15-053`). */
  pasteText: string;
  /** Non-DON lines with needed > 0. */
  lineCount: number;
  /** Copies summed across exported lines. */
  copyCount: number;
};

function isDonCard(card: OptcgSimExportCard): boolean {
  const type = (card.card_type || "").trim().toLowerCase();
  if (type.startsWith("don") || type.includes("don!!")) return true;
  if ((card.section || "").trim().toLowerCase() === "don") return true;
  return (card.card_id || "").toUpperCase().startsWith("DON-");
}

/** Safe download basename from a deck name. */
export function optcgSimFilename(deckName: string): string {
  const base = (deckName || "deck")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  const safe = base || "deck";
  return /\.(txt|deck)$/i.test(safe) ? safe : `${safe}.txt`;
}

/**
 * Build OPTCGSim-compatible deck text from deck cards.
 * Leader is listed first when known; DON!! lines are omitted (sim uses a separate DON deck).
 */
export function buildOptcgSimExport(
  cards: OptcgSimExportCard[],
  opts?: { leaderCardId?: string | null },
): OptcgSimExport {
  const leaderId = (opts?.leaderCardId || "").trim().toUpperCase() || null;
  const lines: OptcgSimExportCard[] = cards.filter(
    (c) => c.needed > 0 && (c.card_id || "").trim() && !isDonCard(c),
  );

  lines.sort((a, b) => {
    const aId = a.card_id.toUpperCase();
    const bId = b.card_id.toUpperCase();
    if (leaderId) {
      if (aId === leaderId && bId !== leaderId) return -1;
      if (bId === leaderId && aId !== leaderId) return 1;
    }
    return aId.localeCompare(bId);
  });

  const pasteLines = lines.map((c) => `${c.needed}x${c.card_id.trim().toUpperCase()}`);
  const copyCount = lines.reduce((sum, c) => sum + c.needed, 0);
  return {
    pasteText: pasteLines.join("\n"),
    lineCount: pasteLines.length,
    copyCount,
  };
}

/** Trigger a browser download of decklist text. */
export function downloadTextFile(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
