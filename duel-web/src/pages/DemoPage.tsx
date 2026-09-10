import type { PlayerView } from "../net/protocol";
import { DuelBoard } from "../board/DuelBoard";

/** Static playmat preview for layout QA (`/demo`). Not a live match. */
export const DEMO_VIEW: PlayerView = {
  seat: 0,
  you: {
    leader: {
      id: "y-leader",
      defId: "ST01-001",
      rested: false,
      power: 7000,
      attachedDonCount: 2,
    },
    characters: [
      { id: "y-c1", defId: "ST01-003", power: 3000 },
      { id: "y-c2", defId: "ST01-006", rested: true, power: 1000 },
      { id: "y-c3", defId: "ST01-008", power: 4000, attachedDonCount: 1 },
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
    leader: { id: "o-leader", defId: "ST01-001", power: 5000 },
    characters: [
      { id: "o-c1", defId: "ST01-008", power: 4000 },
      { id: "o-c2", defId: "ST01-009", rested: true, power: 4000 },
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
  phase: "main",
  turnNumber: 3,
  battle: null,
  pendingTrigger: null,
  winner: null,
  winReason: null,
  legalIntents: [
    { type: "end_turn" },
    { type: "play_character", handIndex: 0 },
    { type: "attach_don", target: "leader", amount: 1 },
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
        onSendIntent={() => undefined}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
