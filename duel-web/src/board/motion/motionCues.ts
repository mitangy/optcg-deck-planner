import type { CardView, PlayerView } from "../../net/protocol";

export type MotionSide = "you" | "opp";

export type MotionCue =
  | { kind: "shuffle"; side: MotionSide }
  | { kind: "draw"; side: MotionSide; count: number; ids: string[] }
  | { kind: "life_to_hand"; side: MotionSide; count: number; ids: string[] }
  | { kind: "life_lost"; side: MotionSide; count: number }
  | { kind: "life_gained"; side: MotionSide; count: number }
  | { kind: "play"; side: MotionSide; id: string; fromHand: boolean }
  | { kind: "leave_field"; side: MotionSide; id: string; defId: string; toTrash: boolean }
  | { kind: "discard"; side: MotionSide; id: string; defId: string }
  | { kind: "don"; side: MotionSide; count: number; activeAfter: number }
  | { kind: "power"; side: MotionSide; id: string; up: boolean };

export const MAX_CUES = 16;

type Side = {
  characters: CardView[];
  stage: CardView | null;
  leader: CardView;
  deckCount: number;
  lifeCount: number;
  trash: string[];
  handIds: string[] | null;
  handDefs: Map<string, string> | null;
  handCount: number;
  donCount: number;
  activeDon: number;
  mulliganDone?: boolean;
};

function sideOf(view: PlayerView, which: MotionSide): Side {
  if (which === "you") {
    const y = view.you;
    return {
      characters: y.characters,
      stage: y.stage,
      leader: y.leader,
      deckCount: y.deckCount,
      lifeCount: y.lifeCount,
      trash: y.trash,
      handIds: view.spectator ? null : y.hand.map((c) => c.id),
      handDefs: view.spectator ? null : new Map(y.hand.map((c) => [c.id, c.defId])),
      handCount: view.spectator ? (y.handCount ?? 0) : y.hand.length,
      donCount: y.costArea.length,
      activeDon: y.activeDonCount,
      mulliganDone: y.mulliganDone,
    };
  }
  const o = view.opponent;
  return {
    characters: o.characters,
    stage: o.stage,
    leader: o.leader,
    deckCount: o.deckCount,
    lifeCount: o.lifeCount,
    trash: o.trash,
    handIds: null,
    handDefs: null,
    handCount: o.handCount,
    donCount: o.costAreaCount,
    activeDon: o.activeDonCount,
    mulliganDone: o.mulliganDone,
  };
}

function fieldCards(s: Side): CardView[] {
  return s.stage ? [...s.characters, s.stage] : s.characters;
}

function sideCues(prev: Side, next: Side, side: MotionSide): MotionCue[] {
  const cues: MotionCue[] = [];
  const deckDrop = Math.max(0, prev.deckCount - next.deckCount);
  const lifeDrop = Math.max(0, prev.lifeCount - next.lifeCount);
  const lifeGain = Math.max(0, next.lifeCount - prev.lifeCount);
  const trashGrew = next.trash.length > prev.trash.length;

  let newHandIds: string[] = [];
  let goneHandIds: string[] = [];
  let arrivals = Math.max(0, next.handCount - prev.handCount);
  if (prev.handIds && next.handIds) {
    const before = new Set(prev.handIds);
    const after = new Set(next.handIds);
    newHandIds = next.handIds.filter((id) => !before.has(id));
    goneHandIds = prev.handIds.filter((id) => !after.has(id));
    arrivals = newHandIds.length;
  }

  const mulligan =
    prev.handIds != null &&
    newHandIds.length > 0 &&
    newHandIds.length === prev.handIds.length &&
    goneHandIds.length === prev.handIds.length &&
    deckDrop === 0 &&
    prev.mulliganDone === false;
  if (mulligan) {
    cues.push({ kind: "shuffle", side });
    cues.push({ kind: "draw", side, count: newHandIds.length, ids: newHandIds });
  } else if (arrivals > 0) {
    const fromLife = Math.min(arrivals, lifeDrop);
    const fromDeck = Math.min(arrivals - fromLife, deckDrop);
    if (fromLife > 0) {
      cues.push({ kind: "life_to_hand", side, count: fromLife, ids: newHandIds.slice(-fromLife) });
    }
    if (fromDeck > 0) {
      cues.push({ kind: "draw", side, count: fromDeck, ids: newHandIds.slice(0, fromDeck) });
    }
  }
  if (lifeDrop > 0) cues.push({ kind: "life_lost", side, count: lifeDrop });
  if (lifeGain > 0) cues.push({ kind: "life_gained", side, count: lifeGain });

  const prevField = fieldCards(prev);
  const nextField = fieldCards(next);
  const prevIds = new Set(prevField.map((c) => c.id));
  const nextById = new Map(nextField.map((c) => [c.id, c]));
  const handShrank = next.handCount < prev.handCount;
  for (const c of nextField) {
    if (prevIds.has(c.id)) continue;
    const fromHand = prev.handIds ? prev.handIds.includes(c.id) : handShrank;
    cues.push({ kind: "play", side, id: c.id, fromHand });
  }
  for (const c of prevField) {
    if (nextById.has(c.id)) continue;
    cues.push({ kind: "leave_field", side, id: c.id, defId: c.defId, toTrash: trashGrew });
  }

  if (trashGrew && prev.handIds) {
    const played = new Set(nextField.map((c) => c.id));
    const trashNew = next.trash.slice(prev.trash.length);
    for (const id of goneHandIds) {
      if (played.has(id)) continue;
      const defId = prev.handDefs?.get(id);
      if (defId && trashNew.includes(defId)) cues.push({ kind: "discard", side, id, defId });
    }
  }

  if (next.donCount > prev.donCount) {
    cues.push({ kind: "don", side, count: next.donCount - prev.donCount, activeAfter: next.activeDon });
  }

  const prevPower = new Map([...prevField, prev.leader].map((c) => [c.id, c.power]));
  for (const c of [...nextField, next.leader]) {
    const before = prevPower.get(c.id);
    if (before == null || c.power == null || before === c.power) continue;
    cues.push({ kind: "power", side, id: c.id, up: c.power > before });
  }
  return cues;
}

export function motionCues(prev: PlayerView | null, next: PlayerView): MotionCue[] {
  if (!prev) return openingCues(next);
  if (prev.seat !== next.seat || prev.cameraSeat !== next.cameraSeat) return [];
  if (next.turnNumber < prev.turnNumber) return [];
  const cues = [
    ...sideCues(sideOf(prev, "you"), sideOf(next, "you"), "you"),
    ...sideCues(sideOf(prev, "opp"), sideOf(next, "opp"), "opp"),
  ];
  return cues.length > MAX_CUES ? [] : cues;
}

function openingCues(view: PlayerView): MotionCue[] {
  if (view.you.mulliganDone !== false || view.turnNumber > 1) return [];
  const ids = view.spectator ? [] : view.you.hand.map((c) => c.id);
  const count = view.spectator ? (view.you.handCount ?? 0) : ids.length;
  const cues: MotionCue[] = [
    { kind: "shuffle", side: "you" },
    { kind: "shuffle", side: "opp" },
  ];
  if (count > 0) cues.push({ kind: "draw", side: "you", count, ids });
  if (view.opponent.handCount > 0) {
    cues.push({ kind: "draw", side: "opp", count: view.opponent.handCount, ids: [] });
  }
  return cues;
}
