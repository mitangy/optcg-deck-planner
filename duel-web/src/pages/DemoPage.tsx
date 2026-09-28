import type { PlayerView } from "../net/protocol";
import type { BattleLogEntry } from "../board/battleLog";
import { DuelBoard } from "../board/DuelBoard";

/** Sample turn log for layout QA (`/demo`). */
export const DEMO_BATTLE_LOG: BattleLogEntry[] = [
  {
    id: "demo-t2-1",
    turn: 2,
    text: "—— Main phase · Opponent ——",
  },
  {
    id: "demo-t2-2",
    turn: 2,
    text: "Opponent plays Jet Pistol",
  },
  {
    id: "demo-t2-3",
    turn: 2,
    text: "Opponent attacks Leader (6000 vs 5000)",
  },
  {
    id: "demo-t2-4",
    turn: 2,
    text: "You counter with Guard Point (+2000)",
  },
  {
    id: "demo-t2-5",
    turn: 2,
    text: "Battle fails (6000 vs 7000)",
  },
  {
    id: "demo-t3-1",
    turn: 3,
    text: "—— Main phase · You ——",
  },
  {
    id: "demo-t3-2",
    turn: 3,
    text: "You attach DON!! to Monkey.D.Luffy → 7000 power",
  },
  {
    id: "demo-t3-3",
    turn: 3,
    text: "You play Nico Robin",
  },
  {
    id: "demo-t3-4",
    turn: 3,
    text: "You attack Leader (7000 vs 5000)",
  },
  {
    id: "demo-t3-5",
    turn: 3,
    text: "Opponent blocks",
  },
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

export function DemoPage() {
  const prompt = new URLSearchParams(window.location.search).get("prompt");
  const view = (prompt && DEMO_PROMPT_VIEWS[prompt === "search" ? "look" : prompt]) || DEMO_VIEW;
  return (
    <div className="duel-root">
      <DuelBoard
        view={view}
        seat={0}
        matchId="demo-playmat"
        errorBanner={null}
        matchOver={null}
        battleLog={DEMO_BATTLE_LOG}
        leaveLabel="Leave match"
        onSendIntent={() => undefined}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
