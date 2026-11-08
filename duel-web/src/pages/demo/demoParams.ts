import type { PlayerView, Seat } from "../../net/protocol";
import {
  DEMO_PROMPT_VIEWS,
  DEMO_VIEW,
  intParam,
  withAttachedDon,
  withBattleDrag,
  withBlockedCharacters,
  withFullBoard,
  withManyStatuses,
  withOneActiveDon,
  withRestedField,
  withWaiting,
} from "../../board/fixtures/demoViews";

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
  const faceUpFor = (lifeCount: number, current: Array<{ index: number; defId: string }>) =>
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

/** `?turn0&pickedby=coin|0|1`: how the turn order was decided, for the mulligan banner's opening line (#549). */
export function demoPickedBy(v: string | null): Seat | null | undefined {
  if (v === "coin") return null;
  return v === "0" ? 0 : v === "1" ? 1 : undefined;
}

/** The static `/demo` view for the URL flags in `params` (the page layers its stateful flags on top). */
export function buildDemoView(params: URLSearchParams): PlayerView {
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
  // `?green`: swap in a Green Leader and a Green Character (y-c3), to check
  // the attack-ready glow stays visible on green art (#449).
  const colored: PlayerView = params.has("green")
    ? {
        ...board,
        you: {
          ...board.you,
          leader: { ...board.you.leader, defId: "ST02-001" },
          characters: board.you.characters.map((c) => (c.id === "y-c3" ? { ...c, defId: "ST02-005" } : c)),
        },
      }
    : board;
  // `?cantattack`: your main phase where only the Leader may attack, so the
  // summoning-sick / rested Characters show the "can't attack" warning.
  // `?unaffordable` is the same with only 1 active DON!!, so the costlier hand
  // cards are grayed out (#356). Add `&attackready` to let y-c3 attack too,
  // so the attack-ready glow shows on a Character as well (#412).
  const mainPhase: PlayerView = params.has("cantattack") || params.has("unaffordable") || params.has("blocked")
    ? {
        ...(params.has("unaffordable") ? withOneActiveDon(colored) : colored),
        ...(params.has("blocked") ? { you: withBlockedCharacters(colored.you) } : {}),
        phase: "main",
        battle: null,
        legalIntents: [
          { type: "end_turn" },
          { type: "declare_attack", attackerId: "y-leader", target: { kind: "leader" } },
          ...(params.has("attackready")
            ? [{ type: "declare_attack" as const, attackerId: "y-c3", target: { kind: "leader" as const } }]
            : []),
          ...colored.legalIntents.filter((i) => i.type === "give_don"),
        ],
      }
    : colored;
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
  return view;
}
