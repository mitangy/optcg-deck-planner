import { useEffect, useMemo, useState } from "react";
import type { CardView, ChatLine, PlayerView, RematchState, UndoState } from "../net/protocol";
import { narrateEvents, type BattleLogEntry, type InstanceIndex } from "../board/battleLog";
import { DuelBoard } from "../board/DuelBoard";
import { motionDemoSteps } from "./motionDemo";
import type { MatchHistoryEntry } from "../history/historyApi";

const DEMO_INSTANCES: InstanceIndex = new Map([
  ["y-leader", { defId: "ST01-001", seat: 0 }],
  ["o-leader", { defId: "ST01-001", seat: 1 }],
  ["o-c1", { defId: "ST01-008", seat: 1 }],
  ["y-c3", { defId: "ST01-008", seat: 0 }],
]);

/** Sample turn log for layout QA (`/demo`) — every emphasis tone at least once. */
export const DEMO_BATTLE_LOG: BattleLogEntry[] = [
  ...narrateEvents(
    [
      { type: "phase_changed", phase: "main", activeSeat: 1 },
      { type: "card_played", seat: 1, defId: "ST01-009", costPaid: 3 },
      { type: "attack_declared", seat: 1, attackerId: "o-c1", target: { kind: "leader" }, attackerPower: 6000, defenderPower: 5000 },
      { type: "counter_applied", seat: 0, defId: "ST01-014", bonus: 2000 },
      { type: "battle_resolved", attackerWon: false, attackerPower: 6000, defenderPower: 7000 },
    ],
    { youSeat: 0, turnNumber: 2, instances: DEMO_INSTANCES },
  ),
  ...narrateEvents(
    [
      { type: "phase_changed", phase: "main", activeSeat: 0 },
      { type: "don_given", seat: 0, targetDefId: "ST01-001", newPower: 7000 },
      { type: "card_played", seat: 0, defId: "ST01-003", costPaid: 4 },
      { type: "ability_activated", seat: 0, defId: "ST01-003", abilityId: "a1", text: "" },
      { type: "card_moved", seat: 0, defId: "ST01-006", from: "deck", to: "hand", hidden: true },
      { type: "card_moved", seat: 0, defId: "ST01-009", from: "hand", to: "trash" },
      { type: "attack_declared", seat: 0, attackerId: "y-c3", target: { kind: "character", instanceId: "o-c1" }, attackerPower: 6000, defenderPower: 4000 },
      { type: "battle_resolved", attackerWon: true, attackerPower: 6000, defenderPower: 4000 },
      { type: "character_ko", seat: 1, defId: "ST01-008" },
      { type: "attack_declared", seat: 0, attackerId: "y-leader", target: { kind: "leader" }, attackerPower: 7000, defenderPower: 5000 },
      { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 1000 },
      { type: "battle_resolved", attackerWon: true, attackerPower: 7000, defenderPower: 6000 },
      { type: "life_taken", seat: 1, defId: "HIDDEN", toHand: true },
    ],
    { youSeat: 0, turnNumber: 3, instances: DEMO_INSTANCES },
  ),
];

/** `?over`: a saved ranked match with a log, as the match-over card finds it (`&guest` leaves it out). */
const loadDemoRecord = (matchId: string): Promise<MatchHistoryEntry> =>
  Promise.resolve({
    match_id: matchId,
    created_at: null,
    ranked: true,
    your_seat: 0,
    won: false,
    reason: "leader_battle_at_zero_life",
    turns: 9,
    your_leader_id: "ST01-001",
    opponent_leader_id: "ST01-001",
    opponent_name: "Opponent",
    rating_before: 1028,
    rating_after: 1012,
    has_replay: false,
    has_log: true,
  });

/** Static playmat preview for layout QA (`/demo`). Not a live match. */
export const DEMO_VIEW: PlayerView = {
  seat: 0,
  you: {
    leader: {
      id: "y-leader",
      defId: "ST01-001",
      rested: false,
      power: 7000,
      printedPower: 5000,
      attachedDonCount: 2,
      statusLabels: [],
    },
    characters: [
      {
        id: "y-c1",
        defId: "ST01-003",
        power: 3000,
        printedPower: 3000,
        statusLabels: ["Summoning sick"],
      },
      {
        id: "y-c2",
        defId: "ST01-006",
        rested: true,
        power: 1000,
        printedPower: 1000,
        statusLabels: ["Rested", "Stun"],
      },
      {
        id: "y-c3",
        defId: "ST01-008",
        power: 6000,
        printedPower: 5000,
        attachedDonCount: 1,
        statusLabels: [],
      },
      { id: "y-saul", defId: "OP17-089", power: 5000, printedPower: 5000, fieldCost: 16, statusLabels: [] },
    ],
    stage: {
      id: "y-stage",
      defId: "OP16-021",
      rested: false,
      power: 0,
      printedPower: 0,
      statusLabels: [],
    },
    hand: [
      { id: "y-h1", defId: "ST01-003" },
      { id: "y-h2", defId: "ST01-006" },
      { id: "y-h3", defId: "ST01-008" },
      { id: "y-h4", defId: "ST01-009" },
      { id: "y-h5", defId: "ST01-014" },
      // Conditional [Counter] event — hand badge reads "+2000 / +4000".
      { id: "y-h6", defId: "OP01-029" },
    ],
    deckCount: 38,
    trash: ["ST01-003", "ST01-014", "ST01-009"],
    lifeCount: 4,
    donDeckCount: 4,
    costArea: [
      { id: "d1", rested: false },
      { id: "d2", rested: false },
      { id: "d3", rested: false },
      { id: "d4", rested: true },
      { id: "d5", rested: true },
      { id: "d6", rested: true },
    ],
    activeDonCount: 3,
    mulliganDone: true,
    turnsStarted: 3,
  },
  opponent: {
    leader: {
      id: "o-leader",
      defId: "ST01-001",
      power: 5000,
      printedPower: 5000,
      statusLabels: [],
    },
    characters: [
      {
        id: "o-c1",
        defId: "ST01-008",
        power: 4000,
        printedPower: 5000,
        statusLabels: ["Nullified"],
      },
      {
        id: "o-c2",
        defId: "ST01-009",
        rested: true,
        power: 4000,
        printedPower: 4000,
        statusLabels: ["Rested", "Unrestable"],
      },
    ],
    stage: null,
    handCount: 6,
    deckCount: 40,
    trash: ["ST01-006", "ST01-008"],
    lifeCount: 5,
    donDeckCount: 6,
    costAreaCount: 4,
    activeDonCount: 2,
    turnsStarted: 2,
  },
  activeSeat: 0,
  phase: "counter",
  turnNumber: 3,
  battle: {
    attackerSeat: 0,
    attackerId: "y-leader",
    target: { kind: "leader" },
    defenderPowerBonus: 0,
    attackerPowerBonus: 0,
  },
  pendingTrigger: null,
  winner: null,
  winReason: null,
  legalIntents: [
    { type: "end_turn" },
    { type: "play_card", handIndex: 0 },
    { type: "play_card", handIndex: 2 },
    { type: "give_don", donId: "d1", targetId: "y-leader" },
    { type: "give_don", donId: "d1", targetId: "y-c1" },
    { type: "give_don", donId: "d2", targetId: "y-leader" },
    {
      type: "activate_ability",
      sourceId: "y-leader",
      abilityId: "leader_give_rested_don",
      targetId: "y-leader",
    },
    {
      type: "activate_ability",
      sourceId: "y-leader",
      abilityId: "leader_give_rested_don",
      targetId: "y-c1",
    },
    {
      type: "activate_ability",
      sourceId: "y-stage",
      abilityId: "stage_trash_give_rested_don",
      targetId: "y-leader",
    },
    {
      type: "activate_ability",
      sourceId: "y-stage",
      abilityId: "stage_trash_give_rested_don",
      targetId: "y-c1",
    },
  ],
};

const DEMO_LOOK_OPTIONS = [
  { id: "o0", defId: "OP09-086", zone: "deck" as const, ownerSeat: 0 as const, eligible: true },
  { id: "o1", defId: "ST01-003", zone: "deck" as const, ownerSeat: 0 as const, eligible: false },
  { id: "o2", defId: "OP09-095", zone: "deck" as const, ownerSeat: 0 as const, eligible: true },
  { id: "o3", defId: "ST01-008", zone: "deck" as const, ownerSeat: 0 as const, eligible: false },
  { id: "o4", defId: "OP09-099", zone: "deck" as const, ownerSeat: 0 as const, eligible: true },
];

function demoChoice(choice: NonNullable<PlayerView["pendingChoices"]>[number]): PlayerView {
  return {
    ...DEMO_VIEW,
    phase: "main",
    battle: null,
    pendingChoices: [choice],
    legalIntents: [{ type: "resolve_pending_choice", accept: true }],
  };
}

/** Adds a trash card to a select request so it can't be answered on the board alone. */
function withExtraOption(view: PlayerView): PlayerView {
  const choice = view.pendingChoices![0]!;
  const request = choice.request as Extract<NonNullable<typeof choice.request>, { type: "select" }>;
  const options = [...request.options, { id: "o9", defId: "ST01-003", zone: "trash" as const, ownerSeat: 0 as const, eligible: true }];
  return { ...view, pendingChoices: [{ ...choice, request: { ...request, options } }] };
}

/**
 * Generic choice prompts for responsive QA (`/demo?prompt=look|select|confirm|unpayable|empty|hand|order|mode|effects|don|don2`).
 * Searches and effect ordering float over the board; add `&box` to see the old pop-up.
 */
export const DEMO_PROMPT_VIEWS: Record<string, PlayerView> = {
  don: demoChoice({
    id: "demo-don",
    seat: 0,
    kind: "effect",
    cardDefId: "OP15-061",
    sourceInstanceId: "y-c1",
    optional: false,
    prompt: "Ohm — choose 1 card to return to your DON!! deck (cost).",
    request: {
      type: "select",
      min: 1,
      max: 1,
      options: [
        { id: "o0", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "Active DON!!", rested: false },
        { id: "o1", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "Rested DON!!", rested: true },
        { id: "o2", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Monkey.D.Luffy", rested: false },
        { id: "o3", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Nico Robin", rested: false },
      ],
    },
  }),
  // DON!! −2: every DON!! on your field, picked straight off the board.
  don2: demoChoice({
    id: "demo-don2",
    seat: 0,
    kind: "effect",
    cardDefId: "OP10-074",
    sourceInstanceId: "y-c1",
    optional: false,
    prompt: "Pica — choose 2 cards to return to your DON!! deck (cost).",
    request: {
      type: "select",
      min: 2,
      max: 2,
      options: [
        ...[0, 1, 2].map((i) => ({ id: `o${i}`, defId: "DON", zone: "don" as const, ownerSeat: 0 as const, eligible: true, label: "Active DON!!", rested: false })),
        ...[0, 1, 2].map((i) => ({ id: `o${i + 3}`, defId: "DON", zone: "don" as const, ownerSeat: 0 as const, eligible: true, label: "Rested DON!!", rested: true })),
        { id: "o6", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Monkey.D.Luffy", rested: false },
        { id: "o7", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Monkey.D.Luffy", rested: false },
        { id: "o8", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Nico Robin", rested: false },
      ],
    },
  }),
  look: demoChoice({
    id: "demo-look",
    seat: 0,
    kind: "effect",
    cardDefId: "OP09-095",
    sourceInstanceId: "y-c1",
    optional: false,
    prompt: "Laffitte — look at the top 5 cards, choose up to 1, then place the rest at the bottom of the deck in any order.",
    privateToSeat: 0,
    optionCount: 5,
    request: {
      type: "look",
      options: DEMO_LOOK_OPTIONS,
      minSelect: 0,
      maxSelect: 1,
      groups: [{ label: "Up to 1: add to hand", max: 1, eligibleIds: ["o0", "o2", "o4"] }],
      rest: "deck_bottom",
      restLabel: "place the rest at the bottom of the deck in any order",
    },
  }),
  satori: demoChoice({
    id: "demo-satori",
    seat: 0,
    kind: "effect",
    cardDefId: "OP15-066",
    sourceInstanceId: "y-c1",
    optional: false,
    prompt: "Satori — look at the top 2 cards, then place the rest all at the top or all at the bottom of the deck.",
    privateToSeat: 0,
    optionCount: 2,
    request: {
      type: "look",
      // The second card has a long name, to check the Top / Bottom rows on phones.
      options: DEMO_LOOK_OPTIONS.slice(0, 2).map((o, i) => ({ ...o, eligible: false, ...(i === 1 ? { defId: "OP17-055" } : {}) })),
      minSelect: 0,
      maxSelect: 0,
      groups: [],
      rest: "top_or_bottom",
      restLabel: "place the rest all at the top or all at the bottom of the deck",
    },
  }),
  rest: demoChoice({
    id: "demo-rest",
    seat: 0,
    kind: "effect",
    cardDefId: "OP01-017",
    optional: false,
    prompt: "Effect — choose up to 1 card to rest.",
    request: {
      type: "select",
      min: 0,
      max: 1,
      options: [
        { id: "o0", defId: "ST01-003", zone: "character", ownerSeat: 0, instanceId: "y-c1", eligible: true },
        { id: "o1", defId: "ST01-006", zone: "character", ownerSeat: 0, instanceId: "y-c2", eligible: true, rested: true },
        { id: "o2", defId: "ST01-008", zone: "character", ownerSeat: 0, instanceId: "y-c3", eligible: true },
        { id: "o3", defId: "ST01-001", zone: "leader", ownerSeat: 1, instanceId: "o-leader", eligible: true },
      ],
    },
  }),
  select: demoChoice({
    id: "demo-select",
    seat: 0,
    kind: "effect",
    cardDefId: "OP01-017",
    optional: false,
    prompt: "Nico Robin — choose up to 1 card to K.O.",
    request: {
      type: "select",
      min: 0,
      max: 1,
      options: [
        { id: "o0", defId: "OP09-086", zone: "character", ownerSeat: 1, instanceId: "o-c1", eligible: true },
        { id: "o1", defId: "ST01-006", zone: "character", ownerSeat: 1, instanceId: "o-c2", eligible: true, rested: true },
      ],
    },
  }),
  // Same picks, but one of them is off the field, so the pop-up grid is used.
  restgrid: withExtraOption(demoChoice({
    id: "demo-restgrid",
    seat: 0,
    kind: "effect",
    cardDefId: "OP01-017",
    optional: false,
    prompt: "Effect — choose up to 1 card to rest.",
    request: {
      type: "select",
      min: 0,
      max: 1,
      options: [
        { id: "o0", defId: "ST01-003", zone: "character", ownerSeat: 0, instanceId: "y-c1", eligible: true },
        { id: "o1", defId: "ST01-006", zone: "character", ownerSeat: 0, instanceId: "y-c2", eligible: true, rested: true },
        { id: "o2", defId: "ST01-008", zone: "character", ownerSeat: 0, instanceId: "y-c3", eligible: true },
        { id: "o3", defId: "ST01-001", zone: "leader", ownerSeat: 1, instanceId: "o-leader", eligible: true },
      ],
    },
  })),
  selectgrid: withExtraOption(demoChoice({
    id: "demo-selectgrid",
    seat: 0,
    kind: "effect",
    cardDefId: "OP01-017",
    optional: false,
    prompt: "Nico Robin — choose up to 1 card to K.O.",
    request: {
      type: "select",
      min: 0,
      max: 1,
      options: [
        { id: "o0", defId: "OP09-086", zone: "character", ownerSeat: 1, instanceId: "o-c1", eligible: true },
        { id: "o1", defId: "ST01-006", zone: "character", ownerSeat: 1, instanceId: "o-c2", eligible: true, rested: true },
      ],
    },
  })),
  confirm: demoChoice({
    id: "demo-confirm",
    seat: 0,
    kind: "effect",
    cardDefId: "OP02-062",
    optional: true,
    prompt: "Monkey.D.Luffy — pay the cost to activate: [On Play] You may trash 2 cards from your hand: Return up to 1 Character with a cost of 4 or less to the owner's hand.",
    request: { type: "confirm" },
  }),
  // The same cost prompt when the hand can't pay it: asked anyway so the opponent can't tell (#369).
  unpayable: demoChoice({
    id: "demo-unpayable",
    seat: 0,
    kind: "effect",
    cardDefId: "OP02-062",
    optional: true,
    unpayable: true,
    prompt: "Monkey.D.Luffy — pay the cost to activate: [On Play] You may trash 2 cards from your hand: Return up to 1 Character with a cost of 4 or less to the owner's hand.",
    request: { type: "confirm" },
  }),
  // A private hand pick with nothing that matches still asks (#369).
  empty: demoChoice({
    id: "demo-empty",
    seat: 0,
    kind: "effect",
    cardDefId: "EB01-020",
    optional: true,
    privateToSeat: 0,
    prompt: "Chambres — No card to add to your hand. Confirm to continue.",
    request: { type: "select", min: 0, max: 0, options: [] },
  }),
  // Lucy's [On Your Opponent's Attack]: Event / Stage cards are tapped in the hand.
  hand: demoChoice({
    id: "demo-hand",
    seat: 0,
    kind: "effect",
    cardDefId: "OP15-002",
    optional: false,
    prompt: "Lucy — choose up to 2 cards to trash.",
    privateToSeat: 0,
    request: {
      type: "select",
      min: 0,
      max: 2,
      options: [
        { id: "o0", defId: "ST01-014", zone: "hand", ownerSeat: 0, instanceId: "y-h5", eligible: true },
        { id: "o1", defId: "OP01-029", zone: "hand", ownerSeat: 0, instanceId: "y-h6", eligible: true },
      ],
    },
  }),
  order: demoChoice({
    id: "demo-order",
    seat: 0,
    kind: "effect",
    cardDefId: "OP03-099",
    optional: false,
    prompt: "Charlotte Katakuri — place each card at the top or bottom of the Life cards.",
    privateToSeat: 0,
    request: { type: "order", destination: "life", allowTopOrBottom: true, options: DEMO_LOOK_OPTIONS.slice(0, 2).map((o) => ({ ...o, zone: "life" as const })) },
  }),
  effects: demoChoice({
    id: "demo-effects",
    seat: 0,
    kind: "order_effects",
    cardDefId: "OP09-095",
    optional: false,
    prompt: "These effects trigger at the same time. Choose the order they resolve in.",
    unorderedChoices: [
      { id: "e0", seat: 0, kind: "effect", cardDefId: "OP09-086", optional: false, prompt: "[On Play] Look at the top 3 cards of your deck and add up to 1 {Revolutionary Army} card to your hand." },
      { id: "e1", seat: 0, kind: "effect", cardDefId: "OP09-095", optional: false, prompt: "[On Play] Look at the top 5 cards of your deck and add up to 1 card to your hand." },
      { id: "e2", seat: 0, kind: "effect", cardDefId: "ST01-001", optional: false, prompt: "[Your Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters." },
    ],
  }),
  mode: demoChoice({
    id: "demo-mode",
    seat: 0,
    kind: "effect",
    cardDefId: "EB01-052",
    optional: false,
    prompt: "Choose one.",
    request: { type: "mode", options: [{ id: "m0", label: "Look at all of your opponent's Life cards", eligible: true }, { id: "m1", label: "Turn all of your Life cards face-down", eligible: true }] },
  }),
};

const DEMO_CHAT: ChatLine[] = [
  { id: "demo-chat-1", seat: 1, text: "gl hf!", at: 0 },
  { id: "demo-chat-2", seat: 0, text: "You too — nice leader.", at: 0 },
];

function intParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Pile / cost-area overrides for layout QA, e.g. `/demo?don=10&rested=10&dondeck=0`
 * or `/demo?deck=0&trash=0&life=0`; `hand=N` sets the size of your hand; `faceup=N` turns the top N Life cards face up.
 * Applied to both seats so each mat is checked.
 */
export function applyDemoZoneParams(base: PlayerView, params: URLSearchParams): PlayerView {
  const don = intParam(params, "don");
  const rested = intParam(params, "rested");
  const donDeck = intParam(params, "dondeck");
  const deck = intParam(params, "deck");
  const trash = intParam(params, "trash");
  const life = intParam(params, "life");
  const hand = intParam(params, "hand");
  const faceUp = intParam(params, "faceup");
  if ([don, rested, donDeck, deck, trash, life, hand, faceUp].every((v) => v == null)) return base;

  const touchDon = don != null || rested != null;
  const total = don ?? base.you.costArea.length;
  const restedCount = Math.min(total, rested ?? 0);
  const activeCount = total - restedCount;
  const costArea = touchDon
    ? Array.from({ length: total }, (_, i) => ({ id: `d${i + 1}`, rested: i >= activeCount }))
    : base.you.costArea;
  const trashFor = (cards: string[]) =>
    trash == null ? cards : Array.from({ length: trash }, (_, i) => cards[i % cards.length] ?? "ST01-003");
  const faceUpFor = (lifeCount: number, current?: Array<{ index: number; defId: string }>) =>
    faceUp == null
      ? current
      : Array.from({ length: Math.min(faceUp, lifeCount) }, (_, i) => ({ index: i, defId: ["OP16-108", "OP09-082", "ST01-003"][i % 3]! }));

  return {
    ...base,
    you: {
      ...base.you,
      costArea,
      activeDonCount: touchDon ? activeCount : base.you.activeDonCount,
      donDeckCount: donDeck ?? base.you.donDeckCount,
      deckCount: deck ?? base.you.deckCount,
      lifeCount: life ?? base.you.lifeCount,
      faceUpLife: faceUpFor(life ?? base.you.lifeCount, base.you.faceUpLife),
      // `?hand=19`: a big hand (the fan must stay on screen), cycling the sample cards.
      hand:
        hand == null
          ? base.you.hand
          : Array.from({ length: hand }, (_, i) => ({
              ...base.you.hand[i % base.you.hand.length]!,
              id: `y-h${i + 1}`,
            })),
      trash: trashFor(base.you.trash),
    },
    opponent: {
      ...base.opponent,
      costAreaCount: touchDon ? total : base.opponent.costAreaCount,
      activeDonCount: touchDon ? activeCount : base.opponent.activeDonCount,
      donDeckCount: donDeck ?? base.opponent.donDeckCount,
      deckCount: deck ?? base.opponent.deckCount,
      lifeCount: life ?? base.opponent.lifeCount,
      faceUpLife: faceUpFor(life ?? base.opponent.lifeCount, base.opponent.faceUpLife),
      trash: trashFor(base.opponent.trash),
    },
  };
}

/** `?full`: a full board, so playing a Character asks which one to replace. */
function withFullBoard(base: PlayerView): PlayerView {
  const extra = [
    { id: "y-c4", defId: "ST01-009", power: 4000, printedPower: 4000, statusLabels: [] },
    { id: "y-c5", defId: "ST01-014", power: 2000, printedPower: 2000, statusLabels: [] },
  ];
  const characters = [...base.you.characters, ...extra].slice(0, 5);
  return {
    ...base,
    phase: "main",
    battle: null,
    you: { ...base.you, characters },
    legalIntents: [
      ...base.legalIntents.filter((i) => i.type !== "play_card"),
      ...characters.map((c) => ({ type: "play_card", handIndex: 0, trashCharacterId: c.id })),
    ],
  };
}

/**
 * `?oppfull` fills the opponent's row to 5; `?rest=N` rests the first N
 * Characters on both mats; `?restlead` rests both leaders and stages (the
 * opponent gets a stage). For checking sideways (rested) card sizing.
 */
function withRestedField(base: PlayerView, params: URLSearchParams): PlayerView {
  const rest = intParam(params, "rest");
  const lead = params.has("restlead");
  const oppFull = params.has("oppfull");
  if (rest == null && !lead && !oppFull) return base;
  const n = rest ?? 0;
  const oppExtra: CardView[] = [
    { id: "o-c3", defId: "ST01-003", power: 3000, printedPower: 3000, statusLabels: [] },
    { id: "o-c4", defId: "ST01-006", power: 1000, printedPower: 1000, statusLabels: [] },
    { id: "o-c5", defId: "ST01-014", power: 2000, printedPower: 2000, statusLabels: [] },
  ];
  const oppChars = oppFull
    ? [...base.opponent.characters, ...oppExtra].slice(0, 5)
    : base.opponent.characters;
  const restFirst = (cards: CardView[]) =>
    cards.map((c, i) => ({ ...c, rested: i < n }));
  return {
    ...base,
    you: {
      ...base.you,
      characters: restFirst(base.you.characters),
      leader: { ...base.you.leader, rested: lead || base.you.leader.rested },
      stage: base.you.stage ? { ...base.you.stage, rested: lead || base.you.stage.rested } : null,
    },
    opponent: {
      ...base.opponent,
      characters: restFirst(oppChars),
      leader: { ...base.opponent.leader, rested: lead || base.opponent.leader.rested },
      stage: lead
        ? { id: "o-stage", defId: "OP16-021", rested: true, power: 0, printedPower: 0, statusLabels: [] }
        : base.opponent.stage,
    },
  };
}

/**
 * `?dons`: attaches 6 / 1 / 2 / 5 DON!! to the leader and first Characters of
 * both mats (pair with `?rest=2` for rested cards), to check the DON!! drawn
 * under a card.
 */
function withAttachedDon(base: PlayerView): PlayerView {
  const counts = [1, 2, 5, 8];
  const give = (c: CardView, n: number): CardView => ({ ...c, attachedDonCount: n });
  const side = <T extends { leader: CardView; characters: CardView[] }>(s: T): T => ({
    ...s,
    leader: give(s.leader, 6),
    characters: s.characters.map((c, i) => (counts[i] ? give(c, counts[i]) : c)),
  });
  return { ...base, you: side(base.you), opponent: side(base.opponent) };
}

/**
 * `?statuses`: stacks several status icons on both leaders and a few
 * Characters (one buffed + DON!!, one rested), to check the badge corner
 * against the power / DON!! stack and the name caption.
 */
function withManyStatuses(base: PlayerView): PlayerView {
  const many = ["Blocker", "Rush", "Double Attack", "Banish", "Unblockable"];
  const tag = (c: CardView, labels: string[]): CardView => ({
    ...c,
    statusLabels: [...(c.statusLabels ?? []), ...labels],
  });
  const [c1, c2, c3, ...rest] = base.you.characters;
  return {
    ...base,
    you: {
      ...base.you,
      leader: tag(base.you.leader, ["Double Attack", "Banish", "Unblockable"]),
      characters: [
        tag(c1, many),
        tag(c2, ["Blocker", "Cannot attack"]),
        tag({ ...c3, attachedDonCount: 2 }, many.slice(0, 3)),
        ...rest,
      ],
    },
    opponent: {
      ...base.opponent,
      leader: tag(base.opponent.leader, ["Blocker", "Won't refresh"]),
      characters: base.opponent.characters.map((c) => tag(c, ["Blocker", "Rush"])),
    },
  };
}

/**
 * `?attack`: your main phase with attacks open, to drag an attacker onto a
 * target. `?counter`: the opponent's Character attacks your Leader and you are
 * in the counter step, to drag a Counter card onto your Leader.
 */
function withBattleDrag(base: PlayerView, params: URLSearchParams): PlayerView {
  if (params.has("attack")) {
    const attacks = ["y-leader", "y-c3"].flatMap((attackerId) => [
      { type: "declare_attack", attackerId, target: { kind: "leader" } },
      { type: "declare_attack", attackerId, target: { kind: "character", instanceId: "o-c2" } },
    ]);
    return { ...base, phase: "main", battle: null, legalIntents: [...base.legalIntents, ...attacks] };
  }
  if (params.has("counter")) {
    // `?counter=short`: a 9000-power attacker, so counters are still needed (no "Resolve" yet).
    // `?counter=newgate`: long names on both sides (Edward.Newgate -> Marshall.D.Teach),
    // to check the battle strip against the dock.
    const mode = params.get("counter");
    const attacker =
      mode === "short"
        ? { power: 9000 }
        : mode === "newgate"
          ? { defId: "OP12-002", power: 5000 }
          : null;
    const opponent = attacker
      ? {
          ...base.opponent,
          characters: base.opponent.characters.map((c) => (c.id === "o-c1" ? { ...c, ...attacker } : c)),
        }
      : base.opponent;
    // `?counter=haki`: the [Counter] event is Color of the Supreme King Haki,
    // whose "rest 1 DON!!?" Yes/No shows above the hand once it is played.
    const you =
      mode === "haki"
        ? {
            ...base.you,
            hand: base.you.hand.map((c) => (c.id === "y-h6" ? { ...c, defId: "OP12-018" } : c)),
          }
        : mode === "newgate"
          ? { ...base.you, leader: { ...base.you.leader, defId: "OP09-081", power: 5000 } }
          : base.you;
    return {
      ...base,
      you,
      opponent,
      activeSeat: 1,
      phase: "counter",
      battle: {
        attackerSeat: 1,
        attackerId: "o-c1",
        target: { kind: "leader" },
        defenderPowerBonus: 0,
        attackerPowerBonus: 0,
      },
      legalIntents: [
        { type: "counter_from_hand", handIndex: 0 },
        { type: "counter_from_hand", handIndex: 2 },
        { type: "counter_from_hand", handIndex: 4 },
        { type: "counter_event", handIndex: 5 },
        { type: "pass_counter" },
      ],
    };
  }
  return base;
}

/**
 * `?counter=block`: the same attack one step earlier, in the block step (Nico
 * Robin can block), to drag a Counter onto the Leader and skip the block.
 */
function withBlockStep(base: PlayerView): PlayerView {
  return {
    ...base,
    phase: "block",
    legalIntents: [{ type: "pass_block" }, { type: "declare_block", blockerId: "y-c3" }],
  };
}

/** `?counter=haki` after the Haki is played: out of the hand, asking its optional DON!! rest. */
function withHakiResolving(base: PlayerView, asking: boolean): PlayerView {
  const you = { ...base.you, hand: base.you.hand.filter((c) => c.id !== "y-h6") };
  if (!asking) return { ...base, you, legalIntents: [{ type: "pass_counter" }] };
  return {
    ...base,
    you: { ...you, resolving: [{ id: "y-h6", defId: "OP12-018" }] },
    pendingChoices: [
      {
        id: "demo-haki",
        seat: 0,
        kind: "effect",
        cardDefId: "OP12-018",
        sourceInstanceId: "y-h6",
        optional: true,
        prompt:
          "Color of the Supreme King Haki — rest 1 of your DON!! cards, and if you do, give your opponent's Leader and all of their Characters -1000 power during this turn? [Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle. Then, you may rest 1 of your DON!! cards. If you do, give your opponent's Leader and all of their Characters \u22121000 power during this turn.",
        request: { type: "confirm" },
      },
    ],
    legalIntents: [
      { type: "resolve_pending_choice", accept: true },
      { type: "resolve_pending_choice", accept: false },
    ],
  };
}

/**
 * `?wait=block|counter|trigger|effect|turn`: you have nothing to do and the
 * game waits on the opponent (their block / counter step to your attack, a Life
 * trigger or effect choice of theirs, or just their turn).
 */
function withWaiting(base: PlayerView, kind: string | null): PlayerView {
  if (!kind) return base;
  const none = { ...base, legalIntents: [] };
  if (kind === "turn") return { ...none, activeSeat: 1, phase: "main", battle: null };
  if (kind === "block" || kind === "counter") {
    return {
      ...none,
      activeSeat: 0,
      phase: kind,
      battle: {
        attackerSeat: 0,
        attackerId: "y-leader",
        target: { kind: "leader" },
        defenderPowerBonus: 0,
        attackerPowerBonus: 0,
      },
    };
  }
  return {
    ...none,
    pendingChoices: [
      {
        id: "wait-1",
        seat: 1,
        kind: kind === "trigger" ? "life_trigger" : "effect",
        cardDefId: "ST01-014",
        optional: true,
        prompt: kind === "trigger" ? "Opponent may activate a Life trigger." : "Opponent chooses a target.",
      },
    ],
  };
}

/** Your side with a single active DON!! (the rest rested). */
function withOneActiveDon(base: PlayerView): PlayerView {
  return {
    ...base,
    you: {
      ...base.you,
      activeDonCount: 1,
      costArea: base.you.costArea.map((d, i) => ({ ...d, rested: i > 0 })),
    },
  };
}

/**
 * Layout QA flags: `?prompt=<kind>` choice prompts, `?turn0` opening-hand
 * state (`&first=1` makes the opponent go first), `?practice` hotseat chrome
 * (shared playmat), `?chat` match chat with sample lines, `?undo` private-room
 * undo (`?undo=ask` shows an incoming request), `?waiting` the invite screen,
 * `?oppturn` the opponent's turn, `?unaffordable` your main phase with 1 active DON!! (costlier hand cards gray out), `?clock` per-player clocks, `?away` a
 * disconnected opponent, `?over` the match-over screen (`&guest`: no saved match) with a rematch vote
 * (`&rematch=ask|wait|choose|left`), `?full` a full board, `?rest=N` / `?restlead` /
 * `?oppfull` rested cards (see withRestedField), `?statuses` stacked status
 * icons (see withManyStatuses), `?motion` a button that steps
 * through every card animation, `?box` the old pop-up instead of floating-card
 * searches and effect ordering (with `?prompt=look|satori|effects`), `?attack` / `?counter` (`=short`: counters still needed; `=newgate`: long names on both sides; `=haki`: the Haki's Yes/No above the hand; `=block`: the block step, to skip it with a Counter drag) drag QA (see
 * withBattleDrag; sent intents land in `window.__demoIntents`). Zone counts and `?hand=N` hand size: see applyDemoZoneParams.
 */
export function DemoPage() {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt");
  const base = applyDemoZoneParams(
    (prompt && DEMO_PROMPT_VIEWS[prompt === "search" ? "look" : prompt]) || DEMO_VIEW,
    params,
  );
  // `?attacked`: an opposing Character is attacking your Leader, so a centred
  // prompt dodges your Leader (usePromptDodge) while you answer it.
  const attacked: PlayerView = params.has("attacked")
    ? {
        ...base,
        battle: {
          attackerSeat: 1,
          attackerId: "o-c1",
          target: { kind: "leader" },
          defenderPowerBonus: 0,
          attackerPowerBonus: 0,
        },
      }
    : base;
  const field = withRestedField(params.has("full") ? withFullBoard(attacked) : attacked, params);
  const withStatuses = params.has("statuses") ? withManyStatuses(field) : field;
  const board = withBattleDrag(
    params.has("dons") ? withAttachedDon(withStatuses) : withStatuses,
    params,
  );
  // `?cantattack`: your main phase where only the Leader may attack, so the
  // summoning-sick / rested Characters show the "can't attack" warning.
  // `?unaffordable` is the same with only 1 active DON!!, so the costlier hand
  // cards are grayed out (#356).
  const mainPhase: PlayerView = params.has("cantattack") || params.has("unaffordable")
    ? {
        ...(params.has("unaffordable") ? withOneActiveDon(board) : board),
        phase: "main",
        battle: null,
        legalIntents: [
          { type: "end_turn" },
          { type: "declare_attack", attackerId: "y-leader", target: { kind: "leader" } },
          ...board.legalIntents.filter((i) => i.type === "give_don"),
        ],
      }
    : board;
  const withTurn: PlayerView = withWaiting(
    params.has("oppturn") ? { ...mainPhase, activeSeat: 1 } : mainPhase,
    params.get("wait"),
  );
  const view: PlayerView = params.has("turn0")
    ? {
        ...withTurn,
        phase: "mulligan",
        turnNumber: 0,
        firstSeat: params.get("first") === "1" ? 1 : 0,
        battle: null,
        you: { ...base.you, mulliganDone: false },
        legalIntents: [
          { type: "mulligan", doMulligan: false },
          { type: "mulligan", doMulligan: true },
        ],
      }
    : withTurn;
  // `?counter=haki`: after the event is played it waits on its optional DON!! rest.
  const [haki, setHaki] = useState<"hand" | "asking" | "done">("hand");
  // `?counter=block`: the block step until No block (or a Counter drag) passes it.
  const [blockPassed, setBlockPassed] = useState(false);
  const shown: PlayerView =
    haki !== "hand"
      ? withHakiResolving(view, haki === "asking")
      : params.get("counter") === "block" && !blockPassed
        ? withBlockStep(view)
        : view;
  // `?motion`: one state per click; Replay remounts the board to replay the deal.
  const motionSteps = useMemo(() => (params.has("motion") ? motionDemoSteps(view) : null), []);
  const [motionStep, setMotionStep] = useState(0);
  const [motionRun, setMotionRun] = useState(0);
  const nextMotion = motionSteps?.[motionStep + 1];
  const [undo, setUndo] = useState<UndoState | null>(() =>
    params.has("undo")
      ? {
          enabled: true,
          targetTurn: 3,
          pending: params.get("undo") === "ask" ? { from: 1, toTurn: 2 } : null,
        }
      : null,
  );
  const [chat, setChat] = useState<ChatLine[]>(DEMO_CHAT);
  // `?reveal`: the opponent reveals a card (then another) a moment after load.
  const [log, setLog] = useState<BattleLogEntry[]>(DEMO_BATTLE_LOG);
  useEffect(() => {
    if (!params.has("reveal")) return;
    const t = window.setTimeout(() => {
      const events = [{ type: "card_revealed", seat: 1, defId: "ST01-009" }];
      if (params.get("reveal") === "2") events.push({ type: "card_revealed", seat: 1, defId: "ST01-006" });
      setLog((prev) => [...prev, ...narrateEvents(events, { youSeat: 0, turnNumber: 3, instances: DEMO_INSTANCES })]);
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  // `?motion` steps carry the events the server would send: narrate them into the log.
  useEffect(() => {
    const events = motionSteps?.[motionStep]?.events;
    if (!events) return;
    setLog((prev) => [...prev, ...narrateEvents(events, { youSeat: 0, turnNumber: 3, instances: DEMO_INSTANCES })]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionStep, motionRun]);
  const [demoClockEnds] = useState(() => Date.now() + 612_000);
  const [rematch, setRematch] = useState<RematchState>(() => {
    const mode = params.get("rematch");
    return {
      available: mode !== "left",
      requested: mode === "ask" ? [false, true] : mode === "wait" ? [true, false] : mode === "choose" ? [true, true] : [false, false],
      declinedBy: null,
      chooser: mode === "choose" ? 0 : null,
    };
  });
  return (
    <div className="duel-root">
      {motionSteps ? (
        <button
          type="button"
          className="motion-demo-btn"
          onClick={() => {
            if (nextMotion) setMotionStep((s) => s + 1);
            else {
              setMotionStep(0);
              setMotionRun((r) => r + 1);
            }
          }}
        >
          {nextMotion ? `Next: ${nextMotion.label}` : "Replay"}
        </button>
      ) : null}
      <DuelBoard
        key={motionRun}
        view={params.has("waiting") ? null : (motionSteps?.[motionStep]?.view ?? shown)}
        seat={0}
        matchId="demo-playmat"
        errorBanner={null}
        matchOver={params.has("over") ? { winner: 1, reason: "leader_battle_at_zero_life" } : null}
        loadMatchRecord={params.has("over") && !params.has("guest") ? loadDemoRecord : undefined}
        rematch={
          params.has("over")
            ? {
                state: rematch,
                onAction: (action) =>
                  setRematch((r) =>
                    action === "request"
                      ? { ...r, requested: [true, true], chooser: 0 }
                      : action === "decline"
                        ? { ...r, requested: [false, false], chooser: null }
                        : r,
                  ),
              }
            : undefined
        }
        battleLog={log}
        leaveLabel="Leave match"
        floatingPrompts={!params.has("box")}
        hotseatPass={
          params.has("practice") ? { otherSeat: 1, onPass: () => undefined } : undefined
        }
        chat={
          params.has("chat")
            ? {
                lines: chat,
                onSend: (text) =>
                  setChat((prev) => [
                    ...prev,
                    { id: `demo-chat-${prev.length + 1}`, seat: 0, text, at: Date.now() },
                  ]),
              }
            : undefined
        }
        onConcede={params.has("practice") ? undefined : () => undefined}
        timer={
          params.has("clock")
            ? {
                protocolVersion: 5,
                turnSeconds: null,
                matchSeconds: null,
                turnEndsAt: null,
                matchEndsAt: null,
                activeSeat: 0,
                seatSeconds: 900,
                seatRemainingMs: [612_000, 48_000],
                clockSeat: 0,
                clockEndsAt: demoClockEnds,
              }
            : null
        }
        opponentAwayUntil={params.has("away") ? demoClockEnds : null}
        undo={
          undo
            ? {
                state: undo,
                onAction: (action) =>
                  setUndo((u) =>
                    u
                      ? {
                          ...u,
                          pending:
                            action === "request" ? { from: 0, toTurn: u.targetTurn ?? 1 } : null,
                        }
                      : u,
                  ),
              }
            : undefined
        }
        onSendIntent={(intent) => {
          const w = window as { __demoIntents?: unknown[] };
          (w.__demoIntents ??= []).push(intent);
          if (params.get("counter") === "block" && intent.type === "pass_block") {
            setBlockPassed(true);
          }
          if (params.get("counter") === "haki") {
            if (intent.type === "counter_event") setHaki("asking");
            if (intent.type === "resolve_pending_choice") setHaki("done");
          }
        }}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
