/**
 * `/demo?motion` script: a sequence of board states that walks through every
 * card animation (shuffle and deal, mulligan, draw, play, DON!!, power, counter,
 * KO, life) one click at a time, for layout QA and preview links. A step's
 * `events` are the game events the server would send with it (narrated into
 * the battle log, which drives the card spotlight).
 */
import type { PlayerView } from "../net/protocol";

export type MotionDemoStep = { label: string; view: PlayerView; events?: unknown[] };

type You = PlayerView["you"];
type Opp = PlayerView["opponent"];

export function motionDemoSteps(base: PlayerView): MotionDemoStep[] {
  const steps: MotionDemoStep[] = [];
  let cur: PlayerView = {
    ...base,
    phase: "mulligan",
    turnNumber: 1,
    battle: null,
    you: { ...base.you, mulliganDone: false },
    opponent: { ...base.opponent, mulliganDone: false },
  };
  steps.push({ label: "Shuffle and deal", view: cur });

  const push = (
    label: string,
    you: (y: You) => You,
    opp: (o: Opp) => Opp = (o) => o,
    events?: unknown[],
  ) => {
    cur = { ...cur, you: you(cur.you), opponent: opp(cur.opponent) };
    steps.push({ label, view: cur, ...(events ? { events } : {}) });
  };

  push(
    "Mulligan",
    (y) => ({
      ...y,
      mulliganDone: true,
      hand: [...y.hand].reverse().map((c, i) => ({ ...c, id: `${c.id}-m${i}` })),
    }),
    (o) => ({ ...o, mulliganDone: true }),
  );
  push("Draw", (y) => ({
    ...y,
    deckCount: y.deckCount - 1,
    hand: [...y.hand, { id: "demo-draw", defId: "ST01-004" }],
  }));
  push("DON!!", (y) => ({
    ...y,
    donDeckCount: y.donDeckCount - 2,
    costArea: [{ id: "demo-don-1", rested: false }, { id: "demo-don-2", rested: false }, ...y.costArea],
    activeDonCount: y.activeDonCount + 2,
  }));
  push(
    "Play",
    (y) => {
      const card = y.hand.find((c) => c.id === "demo-draw")!;
      return {
        ...y,
        hand: y.hand.filter((c) => c !== card),
        characters: [
          ...y.characters,
          { id: card.id, defId: card.defId, power: 5000, printedPower: 5000, summoningSick: true, statusLabels: [] },
        ],
      };
    },
    (o) => o,
    [{ type: "card_played", seat: 0, defId: "ST01-004", instanceId: "demo-draw", costPaid: 2 }],
  );
  push("Power up", (y) => ({
    ...y,
    characters: y.characters.map((c, i) => (i === 0 ? { ...c, power: (c.power ?? 0) + 2000 } : c)),
  }));
  const counter = cur.you.hand.find((c) => c.defId === "ST01-014") ?? cur.you.hand[0]!;
  push(
    "Counter from hand",
    (y) => ({ ...y, hand: y.hand.filter((c) => c.id !== counter.id), trash: [...y.trash, counter.defId] }),
    (o) => o,
    [{ type: "counter_applied", seat: 0, defId: counter.defId, bonus: 2000 }],
  );
  push(
    "Opponent draws",
    (y) => y,
    (o) => ({ ...o, deckCount: o.deckCount - 1, handCount: o.handCount + 1 }),
  );
  push(
    "Opponent plays",
    (y) => y,
    (o) => ({
      ...o,
      handCount: o.handCount - 1,
      characters: [
        ...o.characters,
        { id: "demo-opp-play", defId: "ST01-006", power: 1000, printedPower: 1000, statusLabels: [] },
      ],
    }),
    [{ type: "card_played", seat: 1, defId: "ST01-006", instanceId: "demo-opp-play", costPaid: 1 }],
  );
  push(
    "KO",
    (y) => y,
    (o) => ({ ...o, characters: o.characters.slice(1), trash: [...o.trash, o.characters[0]!.defId] }),
    [{ type: "character_ko", seat: 1, defId: cur.opponent.characters[0]!.defId }],
  );
  push(
    "Opponent trashes from deck",
    (y) => y,
    (o) => ({ ...o, deckCount: o.deckCount - 3, trash: [...o.trash, "ST01-009", "ST01-003", "ST01-005"] }),
    [
      { type: "card_moved", seat: 1, defId: "ST01-009", from: "deck", to: "trash" },
      { type: "card_moved", seat: 1, defId: "ST01-003", from: "deck", to: "trash" },
      { type: "card_moved", seat: 1, defId: "ST01-005", from: "deck", to: "trash" },
    ],
  );
  push(
    "Opponent takes a life",
    (y) => y,
    (o) => ({ ...o, lifeCount: o.lifeCount - 1, handCount: o.handCount + 1 }),
  );
  push("You take a life", (y) => ({
    ...y,
    lifeCount: y.lifeCount - 1,
    hand: [...y.hand, { id: "demo-life", defId: "ST01-005" }],
  }));
  return steps;
}
