import { useMemo, useState } from "react";
import type { CardView, ChatLine, PlayerView, RematchState, UndoState } from "../net/protocol";
import { narrateEvents, type BattleLogEntry, type InstanceIndex } from "../board/battleLog";
import { DuelBoard } from "../board/DuelBoard";
import { motionDemoSteps } from "./motionDemo";

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

/** Generic choice prompts for responsive QA (`/demo?prompt=look|select|confirm|order|mode`). */
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
    prompt: "Satori — look at the top 2 cards, then place each remaining card at the top or bottom of the deck.",
    privateToSeat: 0,
    optionCount: 2,
    request: {
      type: "look",
      options: DEMO_LOOK_OPTIONS.slice(0, 2).map((o) => ({ ...o, eligible: false })),
      minSelect: 0,
      maxSelect: 0,
      groups: [],
      rest: "top_or_bottom",
      restLabel: "place each remaining card at the top or bottom of the deck",
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
  confirm: demoChoice({
    id: "demo-confirm",
    seat: 0,
    kind: "effect",
    cardDefId: "OP02-062",
    optional: true,
    prompt: "Monkey.D.Luffy — pay the cost to activate: [On Play] You may trash 2 cards from your hand: Return up to 1 Character with a cost of 4 or less to the owner's hand.",
    request: { type: "confirm" },
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
 * or `/demo?deck=0&trash=0&life=0`. Applied to both seats so each mat is checked.
 */
export function applyDemoZoneParams(base: PlayerView, params: URLSearchParams): PlayerView {
  const don = intParam(params, "don");
  const rested = intParam(params, "rested");
  const donDeck = intParam(params, "dondeck");
  const deck = intParam(params, "deck");
  const trash = intParam(params, "trash");
  const life = intParam(params, "life");
  if ([don, rested, donDeck, deck, trash, life].every((v) => v == null)) return base;

  const touchDon = don != null || rested != null;
  const total = don ?? base.you.costArea.length;
  const restedCount = Math.min(total, rested ?? 0);
  const activeCount = total - restedCount;
  const costArea = touchDon
    ? Array.from({ length: total }, (_, i) => ({ id: `d${i + 1}`, rested: i >= activeCount }))
    : base.you.costArea;
  const trashFor = (cards: string[]) =>
    trash == null ? cards : Array.from({ length: trash }, (_, i) => cards[i % cards.length] ?? "ST01-003");

  return {
    ...base,
    you: {
      ...base.you,
      costArea,
      activeDonCount: touchDon ? activeCount : base.you.activeDonCount,
      donDeckCount: donDeck ?? base.you.donDeckCount,
      deckCount: deck ?? base.you.deckCount,
      lifeCount: life ?? base.you.lifeCount,
      trash: trashFor(base.you.trash),
    },
    opponent: {
      ...base.opponent,
      costAreaCount: touchDon ? total : base.opponent.costAreaCount,
      activeDonCount: touchDon ? activeCount : base.opponent.activeDonCount,
      donDeckCount: donDeck ?? base.opponent.donDeckCount,
      deckCount: deck ?? base.opponent.deckCount,
      lifeCount: life ?? base.opponent.lifeCount,
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
 * Layout QA flags: `?prompt=<kind>` choice prompts, `?turn0` opening-hand
 * state (`&first=1` makes the opponent go first), `?practice` hotseat chrome
 * (shared playmat), `?chat` match chat with sample lines, `?undo` private-room
 * undo (`?undo=ask` shows an incoming request), `?waiting` the invite screen,
 * `?oppturn` the opponent's turn, `?clock` per-player clocks, `?away` a
 * disconnected opponent, `?over` the match-over screen with a rematch vote
 * (`&rematch=ask|wait|choose|left`), `?full` a full board, `?rest=N` / `?restlead` /
 * `?oppfull` rested cards (see withRestedField), `?motion` a button that steps
 * through every card animation. Zone counts: see applyDemoZoneParams.
 */
export function DemoPage() {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt");
  const base = applyDemoZoneParams(
    (prompt && DEMO_PROMPT_VIEWS[prompt === "search" ? "look" : prompt]) || DEMO_VIEW,
    params,
  );
  const board = withRestedField(params.has("full") ? withFullBoard(base) : base, params);
  const withTurn: PlayerView = params.has("oppturn") ? { ...board, activeSeat: 1 } : board;
  const view: PlayerView = params.has("turn0")
    ? {
        ...withTurn,
        phase: "mulligan",
        turnNumber: 0,
        firstSeat: params.get("first") === "1" ? 1 : 0,
        battle: null,
        you: { ...base.you, mulliganDone: false },
      }
    : withTurn;
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
        view={params.has("waiting") ? null : (motionSteps?.[motionStep]?.view ?? view)}
        seat={0}
        matchId="demo-playmat"
        errorBanner={null}
        matchOver={params.has("over") ? { winner: 1, reason: "leader_battle_at_zero_life" } : null}
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
        battleLog={DEMO_BATTLE_LOG}
        leaveLabel="Leave match"
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
        onSendIntent={() => undefined}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
