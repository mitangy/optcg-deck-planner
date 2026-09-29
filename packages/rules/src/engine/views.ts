/** Per-viewer projections. Hidden cards and private choice options never reach other viewers. */
import { getCardDef } from "../cards/definitions.js";
import type { CardInstance, GameEvent, Intent, MatchState, PendingChoice, Seat } from "../types.js";
import { listLegalIntents } from "./intents.js";
import { costOf, hasRestriction, isNegated, keywordsOf, playCostOf, powerOf } from "./queries.js";
import { activeDon, otherSeat } from "./state.js";

const KEYWORD_LABELS: Record<string, string> = { blocker: "Blocker", rush: "Rush", rush_character: "Rush: Character", double_attack: "Double Attack", banish: "Banish", unblockable: "Unblockable" };

function cardView(state: MatchState, seat: Seat, c: CardInstance) {
  const def = getCardDef(c.defId);
  const statuses: string[] = [];
  const keywords = [...keywordsOf(state, seat, c)];
  if (c.rested) statuses.push("Rested");
  if (isNegated(state, c)) statuses.push("Effects negated");
  if (hasRestriction(state, seat, c, "cannot_attack")) statuses.push("Cannot attack");
  const rush = keywords.includes("rush") || keywords.includes("rush_character");
  if (c.summoningSick && !rush && def.type === "character") statuses.push("Summoning sick");
  for (const k of keywords) statuses.push(KEYWORD_LABELS[k] ?? k);
  if (hasRestriction(state, seat, c, "no_refresh")) statuses.push("Won't refresh");
  for (const label of c.statusLabels ?? []) if (!statuses.includes(label)) statuses.push(label);
  return {
    id: c.id,
    defId: c.defId,
    rested: c.rested,
    attachedDonCount: c.attachedDonIds.length,
    power: powerOf(state, seat, c),
    printedPower: def.power ?? null,
    fieldCost: def.type === "character" ? costOf(state, seat, c) : def.cost,
    summoningSick: Boolean(c.summoningSick && !rush),
    rush,
    keywords,
    statusLabels: statuses,
  };
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
  if (projected.hideCardDefFromOthers && projected.privateToSeat !== viewerSeat) {
    projected.cardDefId = "HIDDEN";
    projected.prompt = "Opponent is resolving a private card choice.";
    delete projected.sourceInstanceId;
  }
  return projected;
}

export function getPlayerView(state: MatchState, seat: Seat) {
  const you = state.players[seat];
  const oppSeat = otherSeat(seat);
  const opp = state.players[oppSeat];
  return {
    seat,
    you: {
      leader: cardView(state, seat, you.leader),
      characters: you.characters.map((c) => cardView(state, seat, c)),
      stage: you.stage ? cardView(state, seat, you.stage) : null,
      hand: you.hand.map((c) => {
        const def = getCardDef(c.defId);
        const row: { id: string; defId: string; playCost?: number } = { id: c.id, defId: c.defId };
        if (state.phase === "main" && state.activeSeat === seat && def.type !== "leader") row.playCost = playCostOf(state, seat, c);
        return row;
      }),
      deckCount: you.deck.length,
      trash: [...you.trash],
      lifeCount: you.life.length,
      faceUpLife: you.life.flatMap((defId, index) => (you.faceUpLife[index] ? [{ index, defId }] : [])),
      resolving: you.resolving.map((c) => ({ id: c.id, defId: c.defId })),
      donDeckCount: you.donDeck.length,
      costArea: you.costArea.map((d) => ({ id: d.id, rested: d.rested })),
      activeDonCount: activeDon(you).length,
      mulliganDone: you.mulliganDone,
      turnsStarted: you.turnsStarted,
    },
    opponent: {
      leader: cardView(state, oppSeat, opp.leader),
      characters: opp.characters.map((c) => cardView(state, oppSeat, c)),
      stage: opp.stage ? cardView(state, oppSeat, opp.stage) : null,
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      trash: [...opp.trash],
      lifeCount: opp.life.length,
      faceUpLife: opp.life.flatMap((defId, index) => (opp.faceUpLife[index] ? [{ index, defId }] : [])),
      resolving: opp.resolving.map((c) => ({ id: c.id, defId: c.defId })),
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
  };
}

export function getSpectatorView(state: MatchState, cameraSeat: Seat = 0) {
  const base = getPlayerView(state, cameraSeat);
  return {
    ...base,
    spectator: true as const,
    cameraSeat,
    you: { ...base.you, hand: [] as { id: string; defId: string }[], handCount: base.you.hand.length },
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
