/**
 * Table-driven card scenarios on top of the Harness. A row names one card,
 * lays out both seats, replays a few steps, and states the resulting board.
 * `runScenarios` turns each row into a vitest case named "<card> <name>", so a
 * mutation can target a row by that fragment.
 *
 * Seat 0 ("me") is the active player when the steps begin. Cards in `field` can
 * attack and activate (they are not summoning sick). Unless a seat sets `don`,
 * it keeps the DON!! the Harness left it with.
 */
import { describe, expect, it } from "vitest";
import { powerOf, keywordsOf } from "../engine/queries.js";
import type { CardInstance, Seat } from "../types.js";
import { Harness } from "./harness.js";

/** A card on a seat's board (Leader, Character or Stage), found by definition id. */
export interface Where { seat: Seat; card: string }
export const mine = (card: string): Where => ({ seat: 0, card });
export const theirs = (card: string): Where => ({ seat: 1, card });

export type FieldCard = string | { card: string; rested?: boolean; /** DON!! attached */ don?: number };

export interface SeatSetup {
  hand?: string[];
  field?: FieldCard[];
  stage?: string;
  /** Life cards, top (next damage) first. */
  life?: string[];
  trash?: string[];
  /** Deck cards, top first. */
  deckTop?: string[];
  don?: { active: number; rested?: number };
  /** DON!! attached to the Leader. */
  leaderDon?: number;
}

export type Step =
  | { play: string; seat?: Seat; rejects?: true; extra?: { trashCharacterId?: string } }
  /** Counter Event from the defender's hand. */
  | { counter: string }
  | { attack: Where; at: "leader" | Where; rejects?: true }
  /** Defender declines to block. */
  | { passBlock: true }
  /** Defender passes block and counter, resolving the battle. */
  | { passBattle: true }
  | { activate: Where; ability: string; rejects?: true }
  | { accept: true }
  | { decline: true }
  /** Answer the front select/mode prompt by definition id or option label. */
  | { pick: string[] }
  | { endTurn: true };

export interface SeatExpect {
  /** Definition ids in hand, any order. */
  hand?: string[];
  /** Definition ids of Characters on the field, any order. */
  field?: string[];
  stage?: string | null;
  /** Life count, or the exact Life cards top first. */
  life?: number | string[];
  trash?: string[];
  /** Deck size change since setup. */
  deckDelta?: number;
  deckTop?: string;
  don?: { active?: number; rested?: number; attached?: number; deck?: number };
  /** Field Characters that are rested, by definition id. */
  rested?: string[];
  /** Power of Leader/Characters by definition id. */
  power?: Record<string, number>;
  /** DON!! attached to Leader/Characters by definition id. */
  attached?: Record<string, number>;
  /** Face-up flags of the Life cards, top first. */
  faceUp?: boolean[];
  /** Characters this seat could block with right now, by definition id. */
  blockers?: string[];
  /** Keywords a Leader/Character currently has. */
  keywords?: Record<string, string[]>;
}

export interface CardScenario {
  /** Card under test; also the id the coverage script looks for. */
  card: string;
  name: string;
  leaders?: { me?: string; opp?: string };
  me?: SeatSetup;
  opp?: SeatSetup;
  steps?: Step[];
  expect: {
    me?: SeatExpect;
    opp?: SeatExpect;
    /** Front pending choice: "none" or its request type. */
    pending?: string;
    winner?: Seat | null;
  };
}

const sorted = (xs: readonly string[]) => [...xs].sort();

function setUp(h: Harness, seat: Seat, s: SeatSetup | undefined): void {
  if (!s) return;
  const p = h.state.players[seat];
  if (s.don) h.don(seat, s.don.active, s.don.rested ?? 0);
  if (s.hand) h.hand(seat, ...s.hand);
  if (s.life) h.life(seat, ...s.life);
  if (s.trash) h.trash(seat, ...s.trash);
  if (s.deckTop) h.deckTop(seat, ...s.deckTop);
  if (s.stage) h.stage(seat, s.stage);
  for (const f of s.field ?? []) {
    const spec = typeof f === "string" ? { card: f } : f;
    const [card] = h.field(seat, spec.card);
    card!.rested = spec.rested ?? false;
    if (spec.don) h.attach(seat, card!, spec.don);
  }
  if (s.leaderDon) h.attach(seat, p.leader, s.leaderDon);
}

function locate(h: Harness, w: Where): CardInstance {
  const found = h.find(w.seat, w.card);
  if (!found) throw new Error(`${w.card} is not on seat ${w.seat}'s board`);
  return found;
}

function runStep(h: Harness, step: Step): void {
  runStepOnly(h, step);
  // Hidden-zone selects are always asked (#369), even when every candidate must be chosen; rows only
  // script real decisions, so answer a prompt that holds none.
  h.forced();
}

function runStepOnly(h: Harness, step: Step): void {
  const active = h.state.activeSeat;
  if ("play" in step) {
    const seat = step.seat ?? active;
    if (step.rejects) {
      const handIndex = h.state.players[seat].hand.findIndex((c) => c.defId === step.play);
      expect(h.try(seat, { type: "play_card", handIndex, ...step.extra }).ok).toBe(false);
    } else h.play(seat, step.play, step.extra);
  } else if ("counter" in step) {
    const seat = (active === 0 ? 1 : 0) as Seat;
    const handIndex = h.state.players[seat].hand.findIndex((c) => c.defId === step.counter);
    if (handIndex < 0) throw new Error(`${step.counter} not in seat ${seat}'s hand`);
    h.act(seat, { type: "counter_event", handIndex });
  } else if ("attack" in step) {
    const attacker = locate(h, step.attack);
    const target = step.at === "leader" ? "leader" : locate(h, step.at);
    if (step.rejects) {
      const intent = { type: "declare_attack" as const, attackerId: attacker.id, target: target === "leader" ? { kind: "leader" as const } : { kind: "character" as const, instanceId: target.id } };
      expect(h.try(active, intent).ok).toBe(false);
    } else h.attack(attacker, target);
  } else if ("passBlock" in step) {
    h.act((active === 0 ? 1 : 0) as Seat, { type: "pass_block" });
  } else if ("passBattle" in step) {
    h.passBattle();
  } else if ("activate" in step) {
    const intent = { type: "activate_ability" as const, sourceId: locate(h, step.activate).id, abilityId: step.ability };
    if (step.rejects) expect(h.try(step.activate.seat, intent).ok).toBe(false);
    else h.act(step.activate.seat, intent);
  } else if ("accept" in step) {
    h.accept();
  } else if ("decline" in step) {
    h.decline();
  } else if ("pick" in step) {
    h.pick(...step.pick);
  } else {
    h.act(active, { type: "end_turn" });
  }
}

function check(h: Harness, seat: Seat, deckBefore: number, e: SeatExpect | undefined): void {
  if (!e) return;
  const p = h.state.players[seat];
  const board = (defId: string): CardInstance => {
    const c = h.find(seat, defId);
    if (!c) throw new Error(`${defId} is not on seat ${seat}'s board`);
    return c;
  };
  if (e.hand) expect(sorted(p.hand.map((c) => c.defId))).toEqual(sorted(e.hand));
  if (e.field) expect(sorted(p.characters.map((c) => c.defId))).toEqual(sorted(e.field));
  if (e.stage !== undefined) expect(p.stage?.defId ?? null).toBe(e.stage);
  if (typeof e.life === "number") expect(p.life.length).toBe(e.life);
  else if (e.life) expect(p.life).toEqual(e.life);
  if (e.faceUp) expect(p.faceUpLife).toEqual(e.faceUp);
  if (e.trash) expect(sorted(p.trash)).toEqual(sorted(e.trash));
  if (e.deckDelta !== undefined) expect(p.deck.length - deckBefore).toBe(e.deckDelta);
  if (e.deckTop) expect(p.deck[0]).toBe(e.deckTop);
  if (e.don?.active !== undefined) expect(p.costArea.filter((d) => !d.rested).length).toBe(e.don.active);
  if (e.don?.rested !== undefined) expect(p.costArea.filter((d) => d.rested).length).toBe(e.don.rested);
  if (e.don?.attached !== undefined) expect(p.attachedDons.length).toBe(e.don.attached);
  if (e.don?.deck !== undefined) expect(p.donDeck.length).toBe(e.don.deck);
  if (e.rested) expect(sorted(p.characters.filter((c) => c.rested).map((c) => c.defId))).toEqual(sorted(e.rested));
  if (e.blockers) {
    const ids = h.legal(seat).flatMap((i) => (i.type === "declare_block" ? [p.characters.find((c) => c.id === i.blockerId)!.defId] : []));
    expect(sorted(ids)).toEqual(sorted(e.blockers));
  }
  for (const [id, power] of Object.entries(e.power ?? {})) expect(powerOf(h.state, seat, board(id)), `power of ${id}`).toBe(power);
  for (const [id, n] of Object.entries(e.attached ?? {})) expect(board(id).attachedDonIds.length, `DON!! on ${id}`).toBe(n);
  for (const [id, kws] of Object.entries(e.keywords ?? {})) expect(sorted([...keywordsOf(h.state, seat, board(id))]), `keywords of ${id}`).toEqual(sorted(kws));
}

export function runScenario(row: CardScenario): void {
  const h = new Harness({ leaders: [row.leaders?.me ?? "ST01-001", row.leaders?.opp ?? "ST01-001"] });
  setUp(h, 0, row.me);
  setUp(h, 1, row.opp);
  const deckBefore: [number, number] = [h.state.players[0].deck.length, h.state.players[1].deck.length];
  for (const step of row.steps ?? []) runStep(h, step);
  check(h, 0, deckBefore[0], row.expect.me);
  check(h, 1, deckBefore[1], row.expect.opp);
  if (row.expect.pending !== undefined) expect(h.choice?.request?.type ?? "none").toBe(row.expect.pending);
  if (row.expect.winner !== undefined) expect(h.state.winner).toBe(row.expect.winner);
}

/** One vitest case per row, named "<card> <name>". */
export function runScenarios(title: string, rows: readonly CardScenario[]): void {
  const names = new Set<string>();
  describe(title, () => {
    for (const row of rows) {
      const name = `${row.card} ${row.name}`;
      if (names.has(name)) throw new Error(`Duplicate scenario ${name}`);
      names.add(name);
      it(name, () => runScenario(row));
    }
  });
}
