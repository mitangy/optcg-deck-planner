/**
 * Import cards Bandai has not published yet from TCGPlayer (tcgcsv.com) into
 * `src/cards/cardData.json`.
 *
 * Usage (from packages/rules):
 *   npx tsx src/tools/importTcgplayerCards.ts --group 24820 [--group <id> ...] [--all] [--dry-run]
 *
 * `--all` walks every group in TCGPlayer category 68 (One Piece), newest first.
 * Merge rules: `bandai` rows are never overwritten; ids that are missing or
 * `bundled` become `source: "tcgplayer"`; existing `tcgplayer` rows are
 * refreshed. A group only contributes ids under its own set prefix (reprints of
 * other sets are ignored) unless the id is missing from cardData entirely.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CardDataFile, CardDataRow } from "../cards/cardData.js";
import { cleanText, normalizeCardName, splitTrigger, VARIANT_SUFFIX } from "./buildCardData.js";

const BASE = "https://tcgcsv.com/tcgplayer/68";

export interface TcgProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
}

export interface ImportResult {
  cards: Record<string, CardDataRow>;
  added: string[];
  upgraded: string[];
  refreshed: string[];
  skippedBandai: string[];
  ignoredForeign: string[];
}

const TYPES: Record<string, CardDataRow["type"]> = { leader: "leader", character: "character", event: "event", stage: "stage" };
const MINUS = "−";

function field(product: TcgProduct, name: string): string | undefined {
  return product.extendedData?.find((e) => e.name === name)?.value;
}

/** Product `Number` (card id), or null for sealed product and other non-cards. */
export function productCardId(product: TcgProduct): string | null {
  const id = field(product, "Number")?.trim().toUpperCase();
  return id && /^[A-Z0-9]+-\d+$/.test(id) ? id : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Convert a TCGPlayer description to Bandai-style text: tags stripped, line
 * breaks collapsed to single spaces, and "Characters-4000 power" / "DON!! -1"
 * written with U+2212 like the Bandai rows. The [Trigger] clause is the line
 * that starts with the tag, so "a [Trigger]" inside a sentence is not a split.
 */
export function convertDescription(html: string): { text: string; trigger: string } {
  const lines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => decodeEntities(line).trim())
    .filter(Boolean);
  const triggerAt = lines.findIndex((line) => line.startsWith("[Trigger]"));
  const textLines = triggerAt < 0 ? lines : lines.slice(0, triggerAt);
  const triggerLines = triggerAt < 0 ? [] : lines.slice(triggerAt);
  const norm = (value: string) => cleanText(value)
    .replace(/(\S)-(\d+)(?= (?:power|cost)\b)/g, `$1 ${MINUS}$2`)
    .replace(/(^|\s)-(\d+)(?= (?:power|cost)\b)/g, `$1${MINUS}$2`)
    .replace(/DON!! -(\d)/g, `DON!! ${MINUS}$1`);
  return { text: norm(textLines.join(" ")), trigger: norm(triggerLines.join(" ")) };
}

function intOrUndefined(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(";").map((v) => v.trim()).filter(Boolean);
}

/** One product (the base printing, i.e. its lowest product id) to a `tcgplayer` row. */
export function productToRow(product: TcgProduct): CardDataRow | null {
  const type = TYPES[(field(product, "CardType") ?? "").trim().toLowerCase()];
  if (!type) return null;
  const { text, trigger } = convertDescription(field(product, "Description") ?? "");
  const cost = intOrUndefined(field(product, "Cost"));
  const power = intOrUndefined(field(product, "Power"));
  const counter = intOrUndefined(field(product, "Counterplus"));
  const life = intOrUndefined(field(product, "Life"));
  return {
    name: normalizeCardName(product.name),
    type,
    colors: splitList(field(product, "Color")).map((c) => c.toLowerCase()),
    ...(type !== "leader" ? { cost: cost ?? 0 } : {}),
    ...(power != null ? { power } : {}),
    ...(counter != null ? { counter } : {}),
    ...(life != null ? { life } : {}),
    traits: splitList(field(product, "Subtypes")),
    attributes: splitList(field(product, "Attribute")),
    text,
    trigger,
    source: "tcgplayer",
    sourceUrl: `https://www.tcgplayer.com/product/${product.productId}`,
  };
}

/** The set prefix of a group: the most common prefix among its card numbers. */
export function groupPrefix(products: TcgProduct[]): string | null {
  const counts = new Map<string, number>();
  for (const p of products) {
    const id = productCardId(p);
    if (id) counts.set(id.split("-")[0]!, (counts.get(id.split("-")[0]!) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Merge TCGPlayer products from one group into the card table (pure). */
export function mergeProducts(existing: Record<string, CardDataRow>, products: TcgProduct[]): ImportResult {
  const out: ImportResult = { cards: { ...existing }, added: [], upgraded: [], refreshed: [], skippedBandai: [], ignoredForeign: [] };
  const prefix = groupPrefix(products);
  const byId = new Map<string, TcgProduct[]>();
  for (const p of products) {
    const id = productCardId(p);
    if (!id) continue;
    byId.set(id, [...(byId.get(id) ?? []), p]);
  }
  for (const [id, printings] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    const current = out.cards[id];
    if (id.split("-")[0] !== prefix && current) { out.ignoredForeign.push(id); continue; }
    if (current?.source === "bandai") { out.skippedBandai.push(id); continue; }
    const sorted = [...printings].sort((a, b) => a.productId - b.productId);
    const base = sorted.find((p) => !VARIANT_SUFFIX.test(p.name)) ?? sorted[0]!;
    const row = productToRow(base);
    if (!row) continue;
    out.cards[id] = row;
    if (!current) out.added.push(id);
    else if (current.source === "bundled") out.upgraded.push(id);
    else out.refreshed.push(id);
  }
  out.cards = Object.fromEntries(Object.entries(out.cards).sort(([a], [b]) => a.localeCompare(b)));
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "optcg-deck-planner card importer" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const groups: number[] = [];
  let all = false;
  const dryRun = args.includes("--dry-run");
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--group") groups.push(Number(args[++i]));
    else if (args[i] === "--all") all = true;
  }
  if (all) {
    const list = await getJson<{ results: { groupId: number; publishedOn?: string }[] }>(`${BASE}/groups`);
    const ordered = [...list.results].sort((a, b) => (b.publishedOn ?? "").localeCompare(a.publishedOn ?? ""));
    for (const g of ordered) if (!groups.includes(g.groupId)) groups.push(g.groupId);
  }
  if (!groups.length || groups.some((g) => !Number.isInteger(g))) throw new Error("Pass --group <id> (repeatable) and/or --all");

  const path = resolve("src/cards/cardData.json");
  const file = JSON.parse(readFileSync(path, "utf8")) as CardDataFile;
  let cards = file.cards;
  const total = { added: [] as string[], upgraded: [] as string[], refreshed: [] as string[], skippedBandai: [] as string[] };
  for (const groupId of groups) {
    const { results } = await getJson<{ results: TcgProduct[] }>(`${BASE}/${groupId}/products`);
    const merged = mergeProducts(cards, results);
    cards = merged.cards;
    total.added.push(...merged.added);
    total.upgraded.push(...merged.upgraded);
    total.refreshed.push(...merged.refreshed);
    total.skippedBandai.push(...merged.skippedBandai);
  }
  console.log(`added (${total.added.length}): ${total.added.join(" ")}`);
  console.log(`upgraded from bundled (${total.upgraded.length}): ${total.upgraded.join(" ")}`);
  console.log(`refreshed tcgplayer (${total.refreshed.length}): ${total.refreshed.join(" ")}`);
  console.log(`skipped, already bandai (${total.skippedBandai.length}): ${total.skippedBandai.join(" ")}`);
  if (dryRun) { console.log("dry run: cardData.json not written"); return; }
  writeFileSync(path, `${JSON.stringify({ ...file, cards })}\n`, "utf8");
  console.log(`Wrote ${Object.keys(cards).length} cards`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
