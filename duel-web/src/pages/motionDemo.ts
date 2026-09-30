/**
 * `/demo?motion` script: a sequence of board states that walks through every
 * card animation (shuffle and deal, mulligan, draw, play, DON!!, power, counter,
 * KO, life) one click at a time, for layout QA and preview links.
 */
import type { PlayerView } from "../net/protocol";

export type MotionDemoStep = { label: string; view: PlayerView };

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

  const push = (label: string, you: (y: You) => You, opp: (o: Opp) => Opp = (o) => o) => {
    cur = { ...cur, you: you(cur.you), opponent: opp(cur.opponent) };
    steps.push({ label, view: cur });
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
  push("Play", (y) => {
    const card = y.hand.find((c) => c.id === "demo-draw")!;
    return {
      ...y,
      hand: y.hand.filter((c) => c !== card),
      characters: [
        ...y.characters,
        { id: card.id, defId: card.defId, power: 5000, printedPower: 5000, summoningSick: true, statusLabels: [] },
      ],
    };
  });
  push("Power up", (y) => ({
    ...y,
    characters: y.characters.map((c, i) => (i === 0 ? { ...c, power: (c.power ?? 0) + 2000 } : c)),
  }));
  push("Counter from hand", (y) => {
    const card = y.hand.find((c) => c.defId === "ST01-014") ?? y.hand[0]!;
    return { ...y, hand: y.hand.filter((c) => c !== card), trash: [...y.trash, card.defId] };
  });
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
  );
  push(
    "KO",
    (y) => y,
    (o) => {
      const ko = o.characters[0]!;
      return { ...o, characters: o.characters.slice(1), trash: [...o.trash, ko.defId] };
    },
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
