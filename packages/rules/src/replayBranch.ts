/**
 * Playing a recorded game from any step (#966): the engine side of the replay viewer's "try a different line".
 * Own-path entry (`@optcg/rules/replayBranch`) for the lazy replay chunk: it imports only the engine, never the simulator.
 */
import { applyIntent, getPlayerView } from "./engine.js";
import type { MatchReplay } from "./matchReplay.js";
import type { GameEvent, Intent, MatchState, Seat } from "./types.js";

export { indexBoardCards } from "./replayTimeline.js";

export type BranchApply = { ok: true; state: MatchState; events: GameEvent[] } | { ok: false; message: string };

/**
 * Apply one move a viewer chose on a replayed board. Same engine call and rng as `replayApply`, so a move
 * identical to the recorded one plays out identically. Reseeds are not applied: they belong to recorded intents.
 */
export function applyBranchIntent(state: MatchState, replay: MatchReplay, seat: Seat, intent: Intent): BranchApply {
  const result = applyIntent(state, intent, { seat });
  if (!result.ok) return { ok: false, message: result.error?.message ?? "That move is not allowed" };
  return { ok: true, state: result.state, events: result.events };
}

export type LiveHandCard = { id: string; defId: string };

/**
 * Both seats' player views of `state`, each carrying both hands as `revealedHands` (the board shows the far hand
 * face up). Life stays face-down unless the game is over. Pending queues are global, so a caller picks whose turn
 * it is to act from both views (duel-web's hotseatControlSeat).
 */
export function getLiveReplayViews(state: MatchState) {
  const hands = ([0, 1] as Seat[]).map((s) => state.players[s].hand.map((c): LiveHandCard => ({ id: c.id, defId: c.defId }))) as [LiveHandCard[], LiveHandCard[]];
  return ([0, 1] as Seat[]).map((seat) => ({ ...getPlayerView(state, seat), revealedHands: hands })) as [
    ReturnType<typeof getPlayerView> & { revealedHands: [LiveHandCard[], LiveHandCard[]] },
    ReturnType<typeof getPlayerView> & { revealedHands: [LiveHandCard[], LiveHandCard[]] },
  ];
}

/**
 * "What I saw": while the game is live, the hand across the table from the seat to act stays a row of card backs
 * unless it is the viewer's own. The acting seat's hand is always shown (it has to be played), and so is every hand
 * once the game is over (#482). Returns the view without `revealedHands`, so the board shows backs by count.
 */
export function hideFarHand<V extends { seat: Seat; winner: Seat | null; revealedHands?: unknown }>(view: V, viewerSeat: Seat): V {
  const far = (1 - view.seat) as Seat;
  if (view.winner !== null || far === viewerSeat) return view;
  const { revealedHands: _hidden, ...rest } = view;
  return rest as V;
}
