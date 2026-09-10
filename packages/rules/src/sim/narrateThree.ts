import { getCardDef, buildTestDeck } from "../cards/definitions.js";
import {
  applyIntent,
  assertInvariants,
  createMatch,
  listLegalIntents,
  skipMulligans,
} from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { GameEvent, MatchState, Seat } from "../types.js";

function actingSeat(state: MatchState): Seat {
  if (state.phase === "mulligan") {
    if (!state.players[0].mulliganDone) return 0;
    return 1;
  }
  if (state.pendingTrigger) return state.pendingTrigger.seat;
  if (state.phase === "block" || state.phase === "counter") {
    return state.battle ? (state.battle.attackerSeat === 0 ? 1 : 0) : state.activeSeat;
  }
  return state.activeSeat;
}

function describeEvents(events: GameEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "card_played":
        lines.push(`  P${e.seat} plays ${getCardDef(e.defId).name}`);
        break;
      case "don_placed":
        lines.push(`  P${e.seat} places ${e.count} DON!!`);
        break;
      case "drew":
        lines.push(`  P${e.seat} draws ${e.count}`);
        break;
      case "don_given":
        lines.push(`  P${e.seat} attaches DON!!`);
        break;
      case "attack_declared":
        lines.push(
          `  P${e.seat} attacks ${e.target.kind === "leader" ? "Leader" : "a Character"}`,
        );
        break;
      case "blocked":
        lines.push(`  P${e.seat} redirects with Blocker`);
        break;
      case "counter_applied":
        lines.push(`  P${e.seat} counters with ${getCardDef(e.defId).name} (+${e.bonus})`);
        break;
      case "battle_resolved":
        lines.push(`  Battle ${e.attackerWon ? "hits" : "fails"}`);
        break;
      case "character_ko":
        lines.push(`  P${e.seat}'s ${getCardDef(e.defId).name} is K.O.'d`);
        break;
      case "life_taken":
        lines.push(
          `  P${e.seat} takes Life (${getCardDef(e.defId).name}${e.toHand ? " → hand" : ", Trigger pending"})`,
        );
        break;
      case "trigger_resolved":
        lines.push(`  P${e.seat} Trigger ${e.accepted ? "accepted" : "declined"}`);
        break;
      case "game_over":
        lines.push(`  ★ P${e.winner} wins (${e.reason})`);
        break;
      case "character_trashed_for_space":
        lines.push(`  P${e.seat} trashes ${getCardDef(e.defId).name} for board space`);
        break;
      case "stage_replaced":
        lines.push(`  P${e.seat} replaces Stage`);
        break;
      default:
        break;
    }
  }
  return lines;
}

function summarizeGame(seed: number): string {
  const rng = createSeededRng(seed);
  const deck = buildTestDeck(20);
  let state = createMatch({
    seed,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: [...deck] },
      { leaderId: "ST01-001", deck: [...deck] },
    ],
  });
  state = skipMulligans(state, rng);

  const narrative: string[] = [];
  narrative.push(`=== Game seed ${seed} ===`);
  narrative.push(
    `Setup: both Leaders at ${state.players[0].life.length} Life. P0 goes first (1 DON!!, no draw, no attack T1).`,
  );

  let intents = 0;
  let attacks = 0;
  let lifeDamage = 0;
  let kos = 0;
  let plays = 0;
  const turnMarks = new Set<string>();

  while (intents < 800 && state.winner === null && state.phase !== "game_over") {
    assertInvariants(state);
    const seat = actingSeat(state);
    const turnKey = `${state.turnNumber}-${state.activeSeat}`;
    if (!turnMarks.has(turnKey) && state.phase === "main") {
      turnMarks.add(turnKey);
      const p = state.players[state.activeSeat];
      narrative.push(
        `Turn ${state.turnNumber} — P${state.activeSeat} (DON!! ${p.costArea.length}, hand ${p.hand.length}, chars ${p.characters.length}, Life ${p.life.length})`,
      );
    }

    const legal = listLegalIntents(state, seat);
    if (!legal.length) throw new Error(`stuck seed=${seed} phase=${state.phase}`);
    const end = legal.find((i) => i.type === "end_turn");
    const pick =
      end && rng.next() < 0.25 ? end : legal[rng.nextInt(legal.length)]!;

    const r = applyIntent(state, pick, { seat, rng });
    if (!r.ok) throw new Error(r.error?.message);
    state = r.state;
    intents += 1;

    for (const e of r.events) {
      if (e.type === "attack_declared") attacks += 1;
      if (e.type === "life_taken") lifeDamage += 1;
      if (e.type === "character_ko") kos += 1;
      if (e.type === "card_played") plays += 1;
    }
    for (const line of describeEvents(r.events)) narrative.push(line);
  }

  narrative.push(
    `Result: P${state.winner} wins via ${state.winReason} after ${intents} actions (~${turnMarks.size} turn starts; ${plays} plays, ${attacks} attacks, ${lifeDamage} Life damage, ${kos} KOs).`,
  );
  narrative.push(
    `Final: Life P0=${state.players[0].life.length} P1=${state.players[1].life.length}; board chars P0=${state.players[0].characters.length} P1=${state.players[1].characters.length}.`,
  );
  return narrative.join("\n");
}

for (const seed of [1000, 1007, 1042]) {
  console.log(summarizeGame(seed));
  console.log("");
}
