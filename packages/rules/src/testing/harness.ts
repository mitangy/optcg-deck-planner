/**
 * Test harness: build a match, then place exact cards in zones and drive
 * intents/choices with assertions. Used by rules tests only.
 */
import { applyIntent, assertInvariants, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { getPlayerView } from "../engine/views.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { ApplyResult, CardInstance, Intent, MatchState, PendingChoice, Seat } from "../types.js";

/** Vanilla filler (no printed text) keeps decks and Life free of stray effects. */
export const FILLER = "ST01-003";

export class Harness {
  state: MatchState;
  rng: Rng;
  private next = 1;

  constructor(opts: { leaders?: [string, string]; seed?: number; deckSize?: number } = {}) {
    const seed = opts.seed ?? 1;
    this.rng = createSeededRng(seed);
    const deck = Array.from({ length: opts.deckSize ?? 40 }, () => FILLER);
    let state = createMatch({ seed, firstSeat: 0, players: [{ leaderId: opts.leaders?.[0] ?? "ST01-001", deck }, { leaderId: opts.leaders?.[1] ?? "ST01-001", deck }] });
    state = skipMulligans(state, this.rng);
    this.state = state;
    // Advance to seat 0's second turn so attacks are legal.
    this.act(0, { type: "end_turn" });
    this.act(1, { type: "end_turn" });
    this.clearHands();
  }

  private id(prefix: string): string {
    return `${prefix}_t${this.next++}`;
  }

  clearHands(): this {
    for (const p of this.state.players) { for (const c of p.hand) { p.deck.push(c.defId); p.zoneInstanceIds.deck.push(c.id); } p.hand = []; }
    return this;
  }

  card(defId: string): CardInstance {
    return { id: this.id("c"), defId, rested: false, attachedDonIds: [] };
  }

  hand(seat: Seat, ...defIds: string[]): CardInstance[] {
    const cards = defIds.map((d) => this.card(d));
    this.state.players[seat].hand.push(...cards);
    return cards;
  }

  field(seat: Seat, ...defIds: string[]): CardInstance[] {
    const cards = defIds.map((d) => ({ ...this.card(d), playedTurn: 0 }));
    this.state.players[seat].characters.push(...cards);
    return cards;
  }

  stage(seat: Seat, defId: string): CardInstance {
    const card = { ...this.card(defId), playedTurn: 0 };
    this.state.players[seat].stage = card;
    return card;
  }

  /** Put cards on top of the deck (first argument ends up on top). */
  deckTop(seat: Seat, ...defIds: string[]): string[] {
    const p = this.state.players[seat];
    const ids = defIds.map(() => this.id("d"));
    p.deck.unshift(...defIds);
    p.zoneInstanceIds.deck.unshift(...ids);
    return ids;
  }

  life(seat: Seat, ...defIds: string[]): void {
    const p = this.state.players[seat];
    p.life = [...defIds];
    p.zoneInstanceIds.life = defIds.map(() => this.id("l"));
    p.faceUpLife = defIds.map(() => false);
  }

  trash(seat: Seat, ...defIds: string[]): string[] {
    const p = this.state.players[seat];
    const ids = defIds.map(() => this.id("t"));
    p.trash.push(...defIds);
    p.zoneInstanceIds.trash.push(...ids);
    return ids;
  }

  /** Set the seat's cost area to `active` active and `rested` rested DON!!. */
  don(seat: Seat, active: number, rested = 0): void {
    const p = this.state.players[seat];
    const all = [...p.donDeck, ...p.costArea, ...p.attachedDons];
    for (const c of [p.leader, ...p.characters]) c.attachedDonIds = [];
    p.attachedDons = [];
    p.costArea = [];
    p.donDeck = [];
    all.forEach((d, i) => {
      d.attachedTo = null;
      if (i < active) { d.rested = false; p.costArea.push(d); }
      else if (i < active + rested) { d.rested = true; p.costArea.push(d); }
      else { d.rested = false; p.donDeck.push(d); }
    });
  }

  attach(seat: Seat, card: CardInstance, count: number): void {
    const p = this.state.players[seat];
    for (let i = 0; i < count; i += 1) {
      const d = p.donDeck.pop() ?? p.costArea.pop();
      if (!d) throw new Error("No DON!! left to attach");
      d.attachedTo = card.id;
      d.rested = false;
      card.attachedDonIds.push(d.id);
      p.attachedDons.push(d);
    }
  }

  try(seat: Seat, intent: Intent): ApplyResult {
    return applyIntent(this.state, intent, { seat, rng: this.rng });
  }

  act(seat: Seat, intent: Intent): this {
    const r = this.try(seat, intent);
    if (!r.ok) throw new Error(`${intent.type} rejected: ${r.error?.message}`);
    assertInvariants(r.state);
    this.state = r.state;
    return this;
  }

  get choice(): PendingChoice | undefined {
    return this.state.pendingChoices[0];
  }

  legal(seat: Seat): Intent[] {
    return listLegalIntents(this.state, seat);
  }

  view(seat: Seat) {
    return getPlayerView(this.state, seat);
  }

  play(seat: Seat, defId: string, extra: Partial<Extract<Intent, { type: "play_card" }>> = {}): this {
    const handIndex = this.state.players[seat].hand.findIndex((c) => c.defId === defId);
    if (handIndex < 0) throw new Error(`${defId} not in hand`);
    return this.act(seat, { type: "play_card", handIndex, ...extra });
  }

  accept(seat?: Seat): this {
    return this.act(seat ?? this.choice!.seat, { type: "resolve_pending_choice", accept: true });
  }

  decline(seat?: Seat): this {
    return this.act(seat ?? this.choice!.seat, { type: "resolve_pending_choice", accept: false });
  }

  /** Answer a select/mode prompt by card definition ids or option labels. */
  pick(...keys: string[]): this {
    const choice = this.choice!;
    const r = choice.request;
    if (!r || !("options" in r)) throw new Error("Front choice has no options");
    const used = new Set<string>();
    const ids = keys.map((k) => {
      const option = r.options.find((o) => !used.has(o.id) && (o.defId === k || o.label === k || o.instanceId === k || o.id === k));
      if (!option) throw new Error(`No option ${k} in ${JSON.stringify(r.options)}`);
      used.add(option.id);
      return option.id;
    });
    return this.act(choice.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  }

  /**
   * Answer every front select that holds no decision: each candidate must be chosen (or none exist).
   * Selects from a hand/deck/Life are always asked (#369) even then, so a test that only cares about the
   * outcome calls this after accepting a cost. A prompt with a real choice is left for the test to answer.
   */
  forced(): this {
    for (;;) {
      const choice = this.choice;
      const r = choice?.request;
      if (!choice || r?.type !== "select" || r.options.length !== r.min || choice.bindings?.__startStage) return this;
      this.act(choice.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds: r.options.map((o) => o.id) });
    }
  }

  find(seat: Seat, defId: string): CardInstance | undefined {
    const p = this.state.players[seat];
    return [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])].find((c) => c.defId === defId);
  }

  attack(attacker: CardInstance, target: CardInstance | "leader"): this {
    return this.act(this.state.activeSeat, { type: "declare_attack", attackerId: attacker.id, target: target === "leader" ? { kind: "leader" } : { kind: "character", instanceId: target.id } });
  }

  /**
   * Defender passes block and counter, resolving the battle. A Life card without [Trigger] opens a
   * `noTrigger` check (#352); it is declined (card to hand) unless `resolveLifeChecks: false`.
   * A [Trigger] card's check is left pending for the test to answer.
   */
  passBattle(opts: { resolveLifeChecks?: boolean } = {}): this {
    const def = (this.state.battle!.attackerSeat === 0 ? 1 : 0) as Seat;
    if (this.state.phase === "block") this.act(def, { type: "pass_block" });
    if (this.state.phase === "counter") this.act(def, { type: "pass_counter" });
    return opts.resolveLifeChecks === false ? this : this.resolveLifeChecks();
  }

  /** Decline every front `noTrigger` Life check (the card goes to hand). Leaves [Trigger] checks and other choices alone. */
  resolveLifeChecks(): this {
    while (this.choice?.kind === "life_trigger" && this.choice.noTrigger) this.decline();
    return this;
  }
}
