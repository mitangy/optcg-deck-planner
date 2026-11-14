/** Per-viewer projections. Hidden cards and private choice options never reach other viewers. */
import { getCardDef } from "../cards/definitions.js";
import type { CardInstance, GameEvent, Intent, MatchState, PendingChoice, Seat } from "../types.js";
import { visibleArtCopies } from "./artCopies.js";
import { listLegalIntents } from "./intents.js";
import { costOf, counterOf, hasRestriction, isNegated, keywordsOf, playCostOf, playerRestricted, powerOf, withQueryCache } from "./queries.js";
import { activeDon, otherSeat } from "./zones.js";

const KEYWORD_LABELS: Record<string, string> = { blocker: "Blocker", rush: "Rush", rush_character: "Rush: Character", double_attack: "Double Attack", banish: "Banish", unblockable: "Unblockable" };

type ArtCopies = ReadonlyMap<string, number>;

/** `{ artCopy }` for a copy of an any-number card, nothing otherwise (the key stays absent for ordinary cards). */
function copyOf(copies: ArtCopies, id: string): { artCopy?: number } {
  const n = copies.get(id);
  return n === undefined ? {} : { artCopy: n };
}

/** Per trash card, its copy rank (null for ordinary cards); undefined when the trash has no any-number card. */
function trashCopies(p: MatchState["players"][Seat], copies: ArtCopies): { trashCopies?: (number | null)[] } {
  if (!copies.size) return {};
  const ranks = p.zoneInstanceIds.trash.map((id) => copies.get(id) ?? null);
  return ranks.some((n) => n !== null) ? { trashCopies: ranks } : {};
}

function cardView(state: MatchState, seat: Seat, c: CardInstance, copies: ArtCopies) {
  const def = getCardDef(c.defId);
  const statuses: string[] = [];
  const keywords = [...keywordsOf(state, seat, c)];
  if (c.rested) statuses.push("Rested");
  if (isNegated(state, c)) statuses.push("Effects negated");
  if (hasRestriction(state, seat, c, "cannot_attack")) statuses.push("Cannot attack");
  if (hasRestriction(state, seat, c, "cannot_be_rested")) statuses.push("Cannot be rested");
  else if (hasRestriction(state, seat, c, "cannot_be_rested_by_opponent_effect")) statuses.push("Unrestable");
  const rush = keywords.includes("rush") || keywords.includes("rush_character");
  // Summoning sickness only matters on its controller's own turn; the flag lingers until their next Refresh.
  const sick = Boolean(c.summoningSick) && state.activeSeat === seat;
  if (sick && !rush && def.type === "character") statuses.push("Summoning sick");
  // Rush only matters the turn the card is played; afterwards its pill is noise (the keyword stays in `keywords`).
  for (const k of keywords) if (sick || (k !== "rush" && k !== "rush_character")) statuses.push(KEYWORD_LABELS[k] ?? k);
  if (hasRestriction(state, seat, c, "no_refresh")) statuses.push("Won't refresh");
  for (const label of c.statusLabels ?? []) if (!statuses.includes(label)) statuses.push(label);
  return {
    id: c.id,
    defId: c.defId,
    ...copyOf(copies, c.id),
    rested: c.rested,
    attachedDonCount: c.attachedDonIds.length,
    power: powerOf(state, seat, c),
    printedPower: def.power ?? null,
    fieldCost: def.type === "character" ? costOf(state, seat, c) : def.cost,
    summoningSick: sick && !rush,
    rush,
    keywords,
    statusLabels: statuses,
    // [Once Per Turn] abilities this card has used this turn (public: the table sees them resolve). Absent when none.
    ...(usedNow(state, c).length ? { usedThisTurn: usedNow(state, c) } : {}),
  };
}

function usedNow(state: MatchState, c: CardInstance): string[] {
  return Object.entries(c.usedAbilities ?? {}).filter(([, turn]) => turn === state.turnNumber).map(([id]) => id);
}

export function projectPendingChoice(choice: PendingChoice, viewerSeat: Seat | null): PendingChoice {
  const projected = structuredClone(choice) as PendingChoice;
  delete projected.resolutionFrameId;
  delete projected.bindings;
  if (projected.unorderedChoices) projected.unorderedChoices = projected.unorderedChoices.map((nested) => projectPendingChoice(nested, viewerSeat));
  const privateView = projected.privateToSeat == null || projected.privateToSeat === viewerSeat;
  if (!privateView && projected.request && "options" in projected.request) {
    projected.optionCount = projected.request.options.length;
    projected.request = { ...projected.request, options: projected.request.options.map((o) => ({ id: o.id, eligible: false, ...(o.zone ? { zone: o.zone } : {}), ...(o.instanceId ? { instanceId: o.instanceId, defId: o.defId } : { defId: "HIDDEN" }) })) } as PendingChoice["request"];
    // Which hidden options satisfy each pick filter reveals card properties: drop eligibility entirely.
    if (projected.request && projected.request.type === "look") {
      projected.request = { ...projected.request, groups: projected.request.groups.map((g) => ({ label: g.label, max: g.max, eligibleIds: [] })) };
    }
    // A private select's options are the hidden cards that matched its filter, so their
    // number (options, min/max, optionCount, the "choose up to N" prompt) is itself hidden.
    // Looks and Life ordering are left as is: their counts are public.
    if (projected.request && projected.request.type === "select") {
      projected.request = { type: "select", min: 0, max: 0, options: [] };
      delete projected.optionCount;
      projected.prompt = "Opponent is making a private choice.";
    }
  }
  // Whether a checked Life card has a [Trigger] is private to its owner (#352).
  if (projected.privateToSeat !== viewerSeat) delete projected.noTrigger;
  // Whether a hidden-card cost can be paid is private to the player asked (#369).
  if (projected.seat !== viewerSeat) delete projected.unpayable;
  if (projected.hideCardDefFromOthers && projected.privateToSeat !== viewerSeat) {
    projected.cardDefId = "HIDDEN";
    projected.prompt = "Opponent is resolving a private card choice.";
    delete projected.sourceInstanceId;
  }
  return projected;
}

type HandCard = { id: string; defId: string; artCopy?: number };

/** Each seat's hand cards an effect revealed this turn, in hand order, indexed by seat. Public information (#491). */
function handReveals(state: MatchState, copies: [ArtCopies, ArtCopies]): { handReveals: [HandCard[], HandCard[]] } | null {
  const of = (seat: Seat): HandCard[] => {
    const ids = state.players[seat].revealedHandIds;
    return ids?.length ? state.players[seat].hand.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, defId: c.defId, ...copyOf(copies[seat], c.id) })) : [];
  };
  const reveals: [HandCard[], HandCard[]] = [of(0), of(1)];
  return reveals[0].length || reveals[1].length ? { handReveals: reveals } : null;
}

/**
 * What `seat` may see of `state`. Static-ability results are memoized for the
 * duration of the call (the state is only read), which is most of its cost.
 */
export function getPlayerView(state: MatchState, seat: Seat, spectator?: { revealHands: boolean }) {
  return withQueryCache(state, () => buildPlayerView(state, seat, spectator));
}

function buildPlayerView(state: MatchState, seat: Seat, spectator?: { revealHands: boolean }) {
  const you = state.players[seat];
  const oppSeat = otherSeat(seat);
  const opp = state.players[oppSeat];
  // Ranks over hidden copies would leak deck size, so only the owner's own view gets the full rank (#1301).
  const viewer = spectator ? null : seat;
  const copiesBySeat: [ArtCopies, ArtCopies] = [visibleArtCopies(state, viewer, 0, spectator?.revealHands), visibleArtCopies(state, viewer, 1, spectator?.revealHands)];
  const youCopies = copiesBySeat[seat];
  const oppCopies = copiesBySeat[oppSeat];
  // Block step too: dragging a Counter onto the defender there skips the block (duel-web).
  const defending = (state.phase === "block" || state.phase === "counter") && state.battle != null && otherSeat(state.battle.attackerSeat) === seat;
  return {
    seat,
    you: {
      leader: cardView(state, seat, you.leader, youCopies),
      characters: you.characters.map((c) => cardView(state, seat, c, youCopies)),
      stage: you.stage ? cardView(state, seat, you.stage, youCopies) : null,
      hand: you.hand.map((c) => {
        const def = getCardDef(c.defId);
        const row: { id: string; defId: string; artCopy?: number; playCost?: number; counter?: number; blocked?: "characters" | "events" | "from_hand" } = { id: c.id, defId: c.defId, ...copyOf(youCopies, c.id) };
        if (state.phase === "main" && state.activeSeat === seat && def.type !== "leader") {
          row.playCost = playCostOf(state, seat, c);
          // Why an effect stops you playing it this turn (mirrors characterPlayable in intents.ts).
          if (playerRestricted(state, seat, "cannot_play_cards_from_hand", c)) row.blocked = "from_hand";
          else if (def.type === "character" && playerRestricted(state, seat, "cannot_play_characters", c)) row.blocked = "characters";
          else if (def.type === "event" && playerRestricted(state, seat, "cannot_play_events")) row.blocked = "events";
        }
        // Live Counter (printed + "+N Counter" statics) while you answer an attack. Own hand only.
        if (defending && def.type === "character") row.counter = counterOf(state, seat, c);
        return row;
      }),
      deckCount: you.deck.length,
      trash: [...you.trash],
      ...trashCopies(you, youCopies),
      lifeCount: you.life.length,
      faceUpLife: you.life.flatMap((defId, index) => (you.faceUpLife[index] ? [{ index, defId, ...copyOf(youCopies, you.zoneInstanceIds.life[index]!) }] : [])),
      resolving: you.resolving.map((c) => ({ id: c.id, defId: c.defId, ...copyOf(youCopies, c.id) })),
      donDeckCount: you.donDeck.length,
      costArea: you.costArea.map((d) => ({ id: d.id, rested: d.rested })),
      activeDonCount: activeDon(you).length,
      mulliganDone: you.mulliganDone,
      turnsStarted: you.turnsStarted,
    },
    opponent: {
      leader: cardView(state, oppSeat, opp.leader, oppCopies),
      characters: opp.characters.map((c) => cardView(state, oppSeat, c, oppCopies)),
      stage: opp.stage ? cardView(state, oppSeat, opp.stage, oppCopies) : null,
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      trash: [...opp.trash],
      ...trashCopies(opp, oppCopies),
      lifeCount: opp.life.length,
      faceUpLife: opp.life.flatMap((defId, index) => (opp.faceUpLife[index] ? [{ index, defId, ...copyOf(oppCopies, opp.zoneInstanceIds.life[index]!) }] : [])),
      resolving: opp.resolving.map((c) => ({ id: c.id, defId: c.defId, ...copyOf(oppCopies, c.id) })),
      donDeckCount: opp.donDeck.length,
      costAreaCount: opp.costArea.length,
      activeDonCount: activeDon(opp).length,
      turnsStarted: opp.turnsStarted,
      mulliganDone: opp.mulliganDone,
    },
    activeSeat: state.activeSeat,
    /** Seat that takes turn 1 (skips its first draw, starts with 1 DON!!). */
    firstSeat: state.firstSeat,
    phase: state.phase,
    turnNumber: state.turnNumber,
    battle: state.battle,
    pendingChoices: state.pendingChoices.map((choice) => projectPendingChoice(choice, seat)),
    /** @deprecated Front life-trigger choice in its legacy shape. */
    pendingTrigger: state.pendingChoices[0]?.kind === "life_trigger" ? { seat: state.pendingChoices[0].seat, cardDefId: state.pendingChoices[0].seat === seat ? state.pendingChoices[0].cardDefId : "HIDDEN" } : null,
    winner: state.winner,
    winReason: state.winReason,
    legalIntents: listLegalIntents(state, seat),
    // Hand cards revealed by an effect stay face up for the rest of the turn; both seats ride along for everyone (#491).
    ...handReveals(state, copiesBySeat),
    // Once the match is over nothing is left to protect (#482): both hands and every Life card
    // ride along, indexed by seat. Absent entirely while the game is live.
    ...(state.winner !== null
      ? {
          revealedHands: [0, 1].map((s) => state.players[s as Seat].hand.map((c): HandCard => ({ id: c.id, defId: c.defId, ...copyOf(copiesBySeat[s as Seat], c.id) }))) as [HandCard[], HandCard[]],
          revealedLife: [[...state.players[0].life], [...state.players[1].life]] as [string[], string[]],
        }
      : null),
  };
}

/**
 * What a client receives as `view` on the wire: a player's view, or the spectator variant of it
 * (`getSpectatorView` adds `spectator`, `cameraSeat` and `you.handCount`). Derived from the builders so the
 * wire type cannot drift from what the engine emits.
 */
export type PlayerView = ReturnType<typeof getPlayerView> & {
  spectator?: boolean;
  cameraSeat?: Seat;
  you: { handCount?: number };
};

/**
 * Spectator view from `cameraSeat`. `you.hand` stays empty and the opponent has
 * no `hand`, so clients that guard against hand leaks keep working. With
 * `revealHands` (unranked rooms) both hands ride along as `revealedHands`,
 * indexed by seat. After the game ends (`winner` set) every view, ranked or not,
 * carries `revealedHands` and `revealedLife` (#482). Like player views, it carries
 * `handReveals` (cards revealed from hand this turn) when any exist (#491).
 */
export function getSpectatorView(state: MatchState, cameraSeat: Seat = 0, opts: { revealHands?: boolean } = {}) {
  const base = getPlayerView(state, cameraSeat, { revealHands: Boolean(opts.revealHands) });
  const copies = [visibleArtCopies(state, null, 0, opts.revealHands), visibleArtCopies(state, null, 1, opts.revealHands)] as const;
  const handOf = (seat: Seat): HandCard[] => state.players[seat].hand.map((c) => ({ id: c.id, defId: c.defId, ...copyOf(copies[seat], c.id) }));
  return {
    ...base,
    spectator: true as const,
    cameraSeat,
    you: { ...base.you, hand: [] as HandCard[], handCount: base.you.hand.length },
    ...(opts.revealHands ? { revealedHands: [handOf(0), handOf(1)] as [HandCard[], HandCard[]] } : null),
    pendingChoices: state.pendingChoices.map((choice) => projectPendingChoice(choice, null)),
    pendingTrigger: state.pendingChoices[0]?.kind === "life_trigger" ? { seat: state.pendingChoices[0].seat, cardDefId: "HIDDEN" } : null,
    legalIntents: [] as Intent[],
  };
}

/** Viewer-specific event projection for hidden zones and private choices. */
export function projectGameEvents(events: readonly GameEvent[], viewerSeat: Seat | null): GameEvent[] {
  return events.map((event) => {
    if (event.type === "life_added" && !event.faceUp) return { ...event, defId: "HIDDEN" };
    if ((event.type === "life_taken" || event.type === "trigger_available") && viewerSeat !== event.seat) return { ...event, defId: "HIDDEN" };
    if (event.type === "drew" && event.defIds && viewerSeat !== event.seat) {
      const { defIds: _hidden, ...rest } = event;
      return structuredClone(rest) as GameEvent;
    }
    if (event.type === "card_moved" && event.hidden && viewerSeat !== event.seat) return { ...event, defId: "HIDDEN" };
    if ((event.type === "pending_choice_added" || event.type === "pending_choice_resolved") && event.hideCardDefFromOthers && event.privateToSeat !== viewerSeat) {
      return event.type === "pending_choice_added" ? { ...event, cardDefId: "HIDDEN", prompt: "Opponent is resolving a private card choice." } : { ...event, cardDefId: "HIDDEN" };
    }
    if (event.type === "pending_choice_added" && event.privateToSeat != null && event.privateToSeat !== viewerSeat) return { ...event, prompt: "Opponent is making a private choice." };
    return structuredClone(event) as GameEvent;
  });
}

export function assertInvariants(state: MatchState): void {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    if (p.faceUpLife.length !== p.life.length) throw new Error(`life visibility mismatch seat ${seat}`);
    if (p.zoneInstanceIds.deck.length !== p.deck.length || p.zoneInstanceIds.trash.length !== p.trash.length || p.zoneInstanceIds.life.length !== p.life.length) throw new Error(`zone identity mismatch seat ${seat}`);
    const cardIds = [p.leader.id, ...p.characters.map((c) => c.id), ...(p.stage ? [p.stage.id] : []), ...p.hand.map((c) => c.id), ...p.resolving.map((c) => c.id), ...p.zoneInstanceIds.deck, ...p.zoneInstanceIds.trash, ...p.zoneInstanceIds.life];
    if (new Set(cardIds).size !== cardIds.length) throw new Error(`duplicate card instance id seat ${seat}`);
    if (p.characters.length > 5) throw new Error(`>5 characters seat ${seat}`);
    const attached = new Set(p.attachedDons.map((d) => d.id));
    for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])]) for (const id of c.attachedDonIds) if (!attached.has(id)) throw new Error(`orphan don ${id}`);
    const donTotal = p.donDeck.length + p.costArea.length + p.attachedDons.length;
    if (donTotal !== 10 && donTotal !== p.donTotal) throw new Error(`DON!! conservation violated seat ${seat}: ${donTotal}`);
  }
}
