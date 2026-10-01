/**
 * Golden replay tooling.
 *
 *   npm run replay:record -- <name> <seed> [--leaders ST01-001,OP01-001] [--first 0|1]
 *                            [--lines 120 | --full] [--note "why this replay exists"]
 *   npm run replay:bless  [-- <name>...]     rewrite goldens from their fixtures
 *
 * `record` plays a seeded game with a random legal-move policy (the fuzzer's
 * deck builder and choice answers) and writes `replays/<name>.json` plus its
 * golden. `bless` re-narrates existing fixtures and overwrites the goldens; it
 * refuses to run when CI is set, and the test suite never writes goldens.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { describeEvents } from "../describeEvents.js";
import { applyIntent, assertInvariants, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { actingSeat, randomAnswer, randomDeck } from "../sim/fuzz.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { REJECTED_MARK, REPLAY_DIR, fixturePath, listReplayNames, loadFixture, playReplay, serializeFixture, writeGolden, type ReplayFixture } from "./replay.js";

interface RecordOptions {
  name: string;
  seed: number;
  leaders: [string | undefined, string | undefined];
  firstSeat: Seat;
  /** Stop once this many narrated lines exist and the game is back in a quiet Main Phase. */
  maxLines: number;
  full: boolean;
  note: string;
}

function countDeck(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of [...ids].sort()) out[id] = (out[id] ?? 0) + 1;
  return out;
}

export function recordReplay(o: RecordOptions): ReplayFixture {
  // Deck building and move choice use their own rng so the fixture only needs the engine rng.
  const pick = createSeededRng((o.seed ^ 0x9e3779b1) >>> 0);
  const a = randomDeck(pick, undefined, o.leaders[0]);
  const b = randomDeck(pick, undefined, o.leaders[1]);
  const fixture: ReplayFixture = {
    note: o.note,
    seed: o.seed,
    firstSeat: o.firstSeat,
    players: [
      { leaderId: a.leaderId, deck: countDeck(a.deck) },
      { leaderId: b.leaderId, deck: countDeck(b.deck) },
    ],
    intents: [],
  };
  let rng = createSeededRng(o.seed);
  let state: MatchState = createMatch({
    seed: o.seed,
    firstSeat: o.firstSeat,
    players: [
      { leaderId: a.leaderId, deck: Object.entries(fixture.players[0].deck).flatMap(([id, n]) => Array<string>(n).fill(id)) },
      { leaderId: b.leaderId, deck: Object.entries(fixture.players[1].deck).flatMap(([id, n]) => Array<string>(n).fill(id)) },
    ],
  });
  state = skipMulligans(state, rng);
  let lines = 0;
  while (state.winner === null && fixture.intents.length < 4000) {
    if (!o.full && lines >= o.maxLines && state.phase === "main" && state.pendingChoices.length === 0 && !state.battle) break;
    assertInvariants(state);
    const seat = actingSeat(state);
    const legal = listLegalIntents(state, seat);
    if (legal.length === 0) throw new Error(`No legal intents phase=${state.phase} seat=${seat}`);
    const front = state.pendingChoices[0];
    const eager = legal.filter((i) => i.type === "play_card" || i.type === "give_don" || i.type === "declare_attack" || i.type === "counter_event" || i.type === "counter_from_hand" || i.type === "declare_block");
    let choice: Intent;
    if (front && front.seat === seat && pick.next() < 0.85) choice = randomAnswer(pick, front);
    else if (eager.length && pick.next() < 0.8) choice = eager[pick.nextInt(eager.length)]!;
    else {
      const end = legal.find((i) => i.type === "end_turn");
      choice = end && pick.next() < 0.3 ? end : legal[pick.nextInt(legal.length)]!;
    }
    // A rejected attempt may still advance the engine rng, so restore it before the fallback.
    const before = rng.snapshot();
    let r = applyIntent(state, choice, { seat, rng });
    if (!r.ok) {
      rng = createSeededRng(before);
      choice = legal[0]!;
      r = applyIntent(state, choice, { seat, rng });
    }
    if (!r.ok) throw new Error(`Rejected legal intent ${JSON.stringify(choice)}: ${r.error?.message}`);
    state = r.state;
    fixture.intents.push({ seat, intent: choice });
    lines += describeEvents(r.events).length;
  }
  return fixture;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): void {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "record") {
    const [name, seedText] = args;
    const seed = Number(seedText);
    if (!name || !/^[a-z0-9-]+$/.test(name) || !Number.isInteger(seed)) throw new Error("usage: replay:record -- <kebab-name> <seed> [--leaders A,B] [--first 0|1] [--lines N | --full] [--note text]");
    const leaders = (flag(args, "leaders") ?? "").split(",");
    const fixture = recordReplay({
      name,
      seed,
      leaders: [leaders[0] || undefined, leaders[1] || undefined],
      firstSeat: flag(args, "first") === "1" ? 1 : 0,
      maxLines: Number(flag(args, "lines") ?? 120),
      full: args.includes("--full"),
      note: flag(args, "note") ?? `Recorded with seed ${seed}.`,
    });
    mkdirSync(REPLAY_DIR, { recursive: true });
    writeFileSync(fixturePath(name), serializeFixture(fixture));
    // Narrate from the written file so the golden is exactly what the test will reproduce.
    writeGolden(name, playReplay(name, loadFixture(name)));
    console.log(`recorded ${name}: ${fixture.intents.length} intents`);
  } else if (cmd === "bless") {
    if (process.env.CI) throw new Error("replay:bless refuses to run in CI; bless locally and commit the diff");
    for (const name of args.length ? args : listReplayNames()) {
      const text = playReplay(name, loadFixture(name));
      if (text.includes(REJECTED_MARK)) throw new Error(`${name}: the engine rejects a recorded intent, so the fixture is stale; re-record it instead of blessing`);
      writeGolden(name, text);
      console.log(`blessed ${name}`);
    }
  } else {
    throw new Error("usage: replayCli.ts record|bless ...");
  }
}

if (process.argv[1] && /replayCli\.ts$/.test(process.argv[1])) main();
