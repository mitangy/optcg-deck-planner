/**
 * Golden replays: a fixture (seed + decks + the intents played) is re-run
 * through the engine and narrated as text. The narration is compared with a
 * checked-in `<name>.golden.txt`, so any change to rules, card data or
 * `describeEvents` shows up as a reviewable text diff.
 *
 * Fixtures hold only inputs (no timestamps, ids minted at runtime, or registry
 * hash). Mulligans are skipped with `skipMulligans`, using the same rng that
 * then drives every `applyIntent`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCardDef } from "../cards/definitions.js";
import { describeEvents } from "../describeEvents.js";
import { applyIntent, createMatch, powerOf, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { CardInstance, Intent, MatchState, Seat } from "../types.js";

export const REPLAY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "replays");

export interface ReplayPlayer {
  leaderId: string;
  /** Card id → copies. Cards enter the deck in key order, which feeds the shuffle. */
  deck: Record<string, number>;
}

export interface ReplayFixture {
  note: string;
  seed: number;
  firstSeat: Seat;
  players: [ReplayPlayer, ReplayPlayer];
  intents: { seat: Seat; intent: Intent }[];
}

export function expandDeck(deck: Record<string, number>): string[] {
  return Object.entries(deck).flatMap(([id, n]) => Array.from({ length: n }, () => id));
}

/** Stable, reviewable JSON: one intent per line, decks one card per line. */
export function serializeFixture(f: ReplayFixture): string {
  const players = f.players.map((p) => {
    const deck = Object.entries(p.deck).map(([id, n]) => `        ${JSON.stringify(id)}: ${n}`).join(",\n");
    return `    {\n      "leaderId": ${JSON.stringify(p.leaderId)},\n      "deck": {\n${deck}\n      }\n    }`;
  });
  const intents = f.intents.map((i) => `    { "seat": ${i.seat}, "intent": ${JSON.stringify(i.intent)} }`);
  return [
    "{",
    `  "note": ${JSON.stringify(f.note)},`,
    `  "seed": ${f.seed},`,
    `  "firstSeat": ${f.firstSeat},`,
    `  "players": [\n${players.join(",\n")}\n  ],`,
    `  "intents": [\n${intents.join(",\n")}\n  ]`,
    "}",
    "",
  ].join("\n");
}

export function listReplayNames(): string[] {
  return readdirSync(REPLAY_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)).sort();
}

export function fixturePath(name: string): string {
  return join(REPLAY_DIR, `${name}.json`);
}

export function loadFixture(name: string): ReplayFixture {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as ReplayFixture;
}

export function goldenPath(name: string): string {
  return join(REPLAY_DIR, `${name}.golden.txt`);
}

export function readGolden(name: string): string | null {
  try { return readFileSync(goldenPath(name), "utf8"); } catch { return null; }
}

export function writeGolden(name: string, text: string): void {
  writeFileSync(goldenPath(name), text);
}

function cardLabel(state: MatchState, seat: Seat, c: CardInstance): string {
  return `${c.defId}${c.rested ? " (rested)" : ""} ${powerOf(state, seat, c)}p${c.attachedDonIds.length ? ` +${c.attachedDonIds.length} DON!!` : ""}`;
}

/** Compact end-of-replay summary of both seats. */
export function summarizeState(state: MatchState): string[] {
  const lines: string[] = [];
  for (const seat of [0, 1] as const) {
    const p = state.players[seat];
    lines.push(`Seat ${seat}: life ${p.life.length}, hand ${p.hand.length}, deck ${p.deck.length}, trash ${p.trash.length}`);
    lines.push(`  leader: ${cardLabel(state, seat, p.leader)}`);
    lines.push(`  characters: ${p.characters.length ? p.characters.map((c) => cardLabel(state, seat, c)).join("; ") : "none"}`);
    lines.push(`  stage: ${p.stage ? cardLabel(state, seat, p.stage) : "none"}`);
    const active = p.costArea.filter((d) => !d.rested).length;
    lines.push(`  DON!!: ${active} active + ${p.costArea.length - active} rested in cost area, ${p.attachedDons.length} attached, ${p.donDeck.length} in DON!! deck`);
  }
  lines.push(`Phase: ${state.phase}, turn ${state.turnNumber}, active seat ${state.activeSeat}`);
  lines.push(`Winner: ${state.winner === null ? "none" : `seat ${state.winner} (${state.winReason})`}`);
  return lines;
}

/** Appears in a narration only when the engine refuses a recorded intent; never blessed. */
export const REJECTED_MARK = "!! REJECTED";

function intentArgs(intent: Intent): string {
  const { type: _type, ...rest } = intent;
  return Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
}

export function playReplay(name: string, f: ReplayFixture): string {
  const rng = createSeededRng(f.seed);
  let state = createMatch({
    seed: f.seed,
    firstSeat: f.firstSeat,
    players: [
      { leaderId: f.players[0].leaderId, deck: expandDeck(f.players[0].deck) },
      { leaderId: f.players[1].leaderId, deck: expandDeck(f.players[1].deck) },
    ],
  });
  state = skipMulligans(state, rng);
  const out: string[] = [`# replay ${name}`, `# ${f.note}`, `seed ${f.seed}, seat ${f.firstSeat} goes first`];
  for (const seat of [0, 1] as const) out.push(`Seat ${seat} leader: ${getCardDef(f.players[seat].leaderId).name} (${f.players[seat].leaderId})`);
  for (const [i, { seat, intent }] of f.intents.entries()) {
    const r = applyIntent(state, intent, { seat, rng });
    out.push("", `> #${i + 1} seat ${seat} ${intent.type}${intentArgs(intent)}`);
    if (!r.ok) {
      // The engine no longer accepts a recorded move: show where, and stop (later moves would be meaningless).
      out.push(`  ${REJECTED_MARK} ${r.error?.code}: ${r.error?.message}`);
      break;
    }
    state = r.state;
    for (const line of describeEvents(r.events)) out.push(`  ${line}`);
  }
  out.push("", "== final state ==", ...summarizeState(state));
  return `${out.join("\n")}\n`;
}
