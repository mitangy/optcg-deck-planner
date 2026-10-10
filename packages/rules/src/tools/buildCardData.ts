/**
 * Build `src/cards/cardData.json` from an official Bandai candidate snapshot.
 *
 * Usage (from packages/rules):
 *   npx tsx src/tools/buildCardData.ts <path/to/artifacts/bandai-full>
 *
 * The candidate is produced by `scripts/import_bandai_metadata.py --all-series`.
 * Base card IDs only (parallel printings `_pN` are art, not gameplay). IDs that
 * exist in the bundled catalog but not in the official English list keep their
 * bundled values and are marked `source: "bundled"` (unverified). Rows imported
 * from TCGPlayer (`importTcgplayerCards.ts`) for ids Bandai lacks are kept.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CardDataRow, CardDataFile } from "../cards/cardData.js";

export type CandidateCard = {
  id: string;
  name: string;
  type: string;
  colors: string[] | null;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  life?: number | null;
  traits?: string[] | null;
  attributes?: string[] | null;
  effectText?: string | null;
  triggerText?: string | null;
  sources?: { url: string; sha256: string }[];
};

export type BundledRow = {
  cost: number;
  type: string;
  name: string;
  colors?: string[];
  power?: number;
  counter?: number;
  life?: number;
  effectText?: string;
};

export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  return text === "-" || text === "—" ? "" : text;
}

export function splitTrigger(text: string): { effect: string; trigger: string } {
  const index = text.indexOf("[Trigger]");
  if (index < 0) return { effect: text, trigger: "" };
  return { effect: text.slice(0, index).trim(), trigger: text.slice(index).trim() };
}

/**
 * Strip printing suffixes from promo names so name-based effects match:
 * "Usopp - P-136 (Premium Card Collection …)", "Trafalgar Law (Event Pack Vol. 4)",
 * "Nico Robin (016) (SP)", "Shirahoshi (Manga)", "Nami (055) (Alternate Art)". Real parenthesised
 * names such as "Zephyr (Navy)" stay.
 */
export function normalizeCardName(name: string): string {
  let out = name.replace(/\s+-\s+(?:OP|ST|EB|PRB|P)\d*-\d+\s*\(.*\)$/, "");
  for (;;) {
    const next = out.replace(/\s+\((?:[^()]*\d[^()]*|SP|Alternate Art|Manga|[^()]*(?:Event|Tournament|Battle|Fest|Release|Pack|Edition)[^()]*)\)$/, "");
    if (next === out) return out.trim();
    out = next;
  }
}


const BASE_TYPES = ["leader", "character", "event", "stage"];

/**
 * Assemble the card table. Precedence per id: Bandai candidate, then an existing
 * `tcgplayer` row (so a Bandai rebuild does not discard cards Bandai has not
 * published yet), then the legacy bundled catalog.
 */
export function buildCards(
  candidateCards: Record<string, CandidateCard>,
  bundled: Record<string, BundledRow>,
  previous: Record<string, CardDataRow> = {},
): Record<string, CardDataRow> {
  const cards: Record<string, CardDataRow> = {};
  for (const [key, card] of Object.entries(candidateCards)) {
    if (key.includes("_")) continue;
    const type = card.type as CardDataRow["type"];
    cards[card.id] = {
      name: normalizeCardName(card.name),
      type,
      colors: card.colors ?? [],
      ...(type !== "leader" ? { cost: card.cost ?? 0 } : {}),
      ...(card.power != null ? { power: card.power } : {}),
      ...(card.counter != null ? { counter: card.counter } : {}),
      ...(card.life != null ? { life: card.life } : {}),
      traits: card.traits ?? [],
      attributes: card.attributes ?? [],
      text: cleanText(card.effectText),
      trigger: cleanText(card.triggerText),
      source: "bandai",
      sourceUrl: card.sources?.[0]?.url ?? "",
    };
  }

  for (const [id, row] of Object.entries(previous)) {
    if (cards[id] || row.source !== "tcgplayer") continue;
    cards[id] = row;
  }

  for (const [id, row] of Object.entries(bundled)) {
    if (cards[id]) continue;
    const { effect, trigger } = splitTrigger(cleanText(row.effectText));
    const type = (BASE_TYPES.includes(row.type) ? row.type : "character") as CardDataRow["type"];
    cards[id] = {
      name: normalizeCardName(row.name),
      type,
      colors: row.colors ?? [],
      ...(type !== "leader" ? { cost: row.cost ?? 0 } : {}),
      ...(row.power != null ? { power: row.power } : {}),
      ...(row.counter != null ? { counter: row.counter } : {}),
      ...(row.life != null ? { life: row.life } : {}),
      traits: [],
      attributes: [],
      text: effect,
      trigger,
      source: "bundled",
      sourceUrl: "",
    };
  }
  return Object.fromEntries(Object.entries(cards).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] ?? "../../artifacts/bandai-full");
  const latest = JSON.parse(readFileSync(resolve(dir, "latest-candidate.json"), "utf8")) as { candidate: string };
  const candidate = JSON.parse(readFileSync(resolve(dir, latest.candidate), "utf8")) as { cards: Record<string, CandidateCard> };
  const bundled = JSON.parse(readFileSync(resolve("src/cards/catalogMeta.json"), "utf8")) as Record<string, BundledRow>;
  const previous = (JSON.parse(readFileSync(resolve("src/cards/cardData.json"), "utf8")) as CardDataFile).cards;
  const sorted = buildCards(candidate.cards, bundled, previous);
  const file: CardDataFile = { candidate: latest.candidate, generatedFrom: "scripts/import_bandai_metadata.py --all-series", cards: sorted };
  writeFileSync(resolve("src/cards/cardData.json"), `${JSON.stringify(file)}\n`, "utf8");
  const counts: Record<string, number> = {};
  for (const row of Object.values(sorted)) counts[`${row.source}:${row.type}`] = (counts[`${row.source}:${row.type}`] ?? 0) + 1;
  console.log(`Wrote ${Object.keys(sorted).length} cards`, counts);
}
