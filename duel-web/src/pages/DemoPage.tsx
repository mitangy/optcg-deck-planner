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
    stage: null,
    hand: [
      { id: "y-h1", defId: "ST01-003" },
      { id: "y-h2", defId: "ST01-006" },
      { id: "y-h3", defId: "ST01-008" },
      { id: "y-h4", defId: "ST01-009" },
      { id: "y-h5", defId: "ST01-014" },
    ],
    deckCount: 38,
    trash: ["ST01-003"],
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
    trash: [],
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
    { type: "activate_leader", targetId: "y-leader" },
  ],
};

export function DemoPage() {
  return (
    <div className="duel-root">
      <DuelBoard
        view={DEMO_VIEW}
        seat={0}
        matchId="demo-playmat"
        errorBanner={null}
        matchOver={null}
        battleLog={DEMO_BATTLE_LOG}
        onSendIntent={() => undefined}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
