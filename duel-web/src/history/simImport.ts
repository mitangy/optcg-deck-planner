/**
 * Reading an OPTCGSim upload for import (#1030): the optcgsim-matches export (a JSON array of games), or one
 * pasted combat log. Pure; the server validates every game again and drops all player names.
 */
import type { SimImportResult } from "./historyApi";

const ZW = /[​‌‍﻿]/g;
export const normalizeName = (s: string) => s.replace(ZW, "").trim();

/** Games per request: the export holds ~50 KB of log per game and the server caps a body and a batch. */
export const BATCH_GAMES = 25;
export const BATCH_BYTES = 3_000_000;

export type SimUpload = { kind: "games"; games: unknown[] } | { kind: "log"; log: string } | { kind: "error"; message: string };

/** A JSON array of games (or `{games: [...]}` / one game object), or else text taken as a single combat log. */
export function readSimUpload(text: string): SimUpload {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "error", message: "Nothing to import. Choose the export file or paste a combat log." };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return { kind: "error", message: "That looks like JSON but could not be read. Choose the unedited export file." };
    }
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { games?: unknown }).games)
        ? (value as { games: unknown[] }).games
        : value && typeof value === "object"
          ? [value]
          : [];
    if (list.length === 0) return { kind: "error", message: "No games found in that file." };
    return { kind: "games", games: list };
  }
  if (!/RZ1\|PLY\|/.test(trimmed)) return { kind: "error", message: "That is not an OPTCGSim export or combat log." };
  return { kind: "log", log: trimmed };
}

/** Split games into request-sized batches, in order. */
export function batchGames(games: unknown[]): unknown[][] {
  const out: unknown[][] = [];
  let cur: unknown[] = [];
  let bytes = 0;
  for (const g of games) {
    const size = JSON.stringify(g).length;
    if (cur.length > 0 && (cur.length >= BATCH_GAMES || bytes + size > BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(g);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function addResults(a: SimImportResult, b: SimImportResult): SimImportResult {
  return {
    imported: a.imported + b.imported,
    skipped_duplicates: a.skipped_duplicates + b.skipped_duplicates,
    skipped_invalid: a.skipped_invalid + b.skipped_invalid,
    total: a.total + b.total,
  };
}

export const NO_RESULT: SimImportResult = { imported: 0, skipped_duplicates: 0, skipped_invalid: 0, total: 0 };

/** "Imported 3, skipped 2 (1 already imported, 1 not usable)." */
export function describeImport(r: SimImportResult): string {
  const skipped = r.skipped_duplicates + r.skipped_invalid;
  if (skipped === 0) return `Imported ${r.imported}.`;
  const why = [r.skipped_duplicates ? `${r.skipped_duplicates} already imported` : "", r.skipped_invalid ? `${r.skipped_invalid} not usable` : ""].filter(Boolean);
  return `Imported ${r.imported}, skipped ${skipped} (${why.join(", ")}).`;
}

export type LogPlayer = { name: string; leaderId: string };

/** The two players a combat log names (from its PLY lines), in owner order. */
export function logPlayers(log: string): LogPlayer[] {
  const seen = new Map<number, LogPlayer>();
  for (const m of log.replace(ZW, "").matchAll(/^RZ1\|PLY\|(\d+)\|([^|\n]*)\|([^|\n]*)/gm)) {
    seen.set(Number(m[1]), { name: m[2]!.trim(), leaderId: m[3]!.trim() });
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Cards each player took out of their deck, as "2xOP01-001" lines. A pasted log has no deck list, so this is the cards seen. */
function seenCards(log: string, owner: number): string[] {
  const counts = new Map<string, number>();
  for (const line of log.split("\n")) {
    const p = line.trim().split("|");
    if (p[0] !== "RZ1" || !/^\d+$/.test(p[1] ?? "") || Number(p[2]) !== owner || p[4] !== "0" || !p[3] || p[3] === "Don") continue;
    counts.set(p[3], (counts.get(p[3]) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => `${n}x${id}`);
}

/** A one-game record from a pasted combat log; `myIndex` is which PLY player is the one importing (0 or 1). */
export function logToGame(log: string, myIndex: 0 | 1, won: boolean, key: string): Record<string, unknown> | null {
  const players = logPlayers(log);
  const me = players[myIndex];
  const opp = players[1 - myIndex];
  if (!me || !opp) return null;
  const owners = [...log.replace(ZW, "").matchAll(/^RZ1\|PLY\|(\d+)\|/gm)].map((m) => Number(m[1])).sort((a, b) => a - b);
  const myDeck = seenCards(log.replace(ZW, ""), owners[myIndex]!);
  const oppDeck = seenCards(log.replace(ZW, ""), owners[1 - myIndex]!);
  if (!myDeck.length || !oppDeck.length) return null;
  return {
    matchKey: key,
    playerName: me.name,
    oppPlayerName: opp.name,
    playerLeader: me.leaderId,
    oppLeader: opp.leaderId,
    decklist: myDeck,
    oppDecklist: oppDeck,
    result: won ? "Won" : "Lost",
    combatLog: log,
  };
}

/** A stable key for a pasted log, so pasting the same game twice imports it once. */
export async function logKey(log: string): Promise<string> {
  const data = new TextEncoder().encode(log);
  try {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return "paste-" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 5381;
    for (const b of data) h = ((h * 33) ^ b) >>> 0;
    return `paste-${h.toString(16)}-${data.length}`;
  }
}
