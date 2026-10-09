/**
 * A recorded game as a timeline a viewer can scrub: the replay re-run once,
 * keeping a checkpoint state every few steps plus small per-step metadata
 * (not every state, which would cost tens of MB on a phone). Any step is then
 * at most `every - 1` intents away from a checkpoint.
 *
 * This file is meant to be imported on its own path (`@optcg/rules/replayTimeline`)
 * by the app's lazy replay chunk, so it imports only the engine, never the
 * simulator or test helpers.
 */
import { getSpectatorView, projectGameEvents, projectPendingChoice } from "./engine.js";
import { replayApply, replayStart, type MatchReplay } from "./matchReplay.js";
import type { CardDefId, GameEvent, InstanceId, Intent, MatchState, Seat } from "./types.js";

export { RULES_VERSION } from "./state/snapshot.js";
export { REGISTRY_HASH } from "./cards/abilities.js";
export { MATCH_REPLAY_SCHEMA, type MatchReplay } from "./matchReplay.js";

export interface TimelineStep {
  /** Who sent the intent. */
  seat: Seat;
  intentType: Intent["type"];
  /** State after this step. */
  turnNumber: number;
  activeSeat: Seat;
  phase: MatchState["phase"];
  events: GameEvent[];
}

export interface ReplayTimeline {
  replay: MatchReplay;
  /** The match as dealt: step 0. */
  start: MatchState;
  /** `steps[i]` is the result of intent `i`, so the state after it is step `i + 1`. */
  steps: TimelineStep[];
  every: number;
  /** `checkpoints[k]` is the state at step `k * every`. */
  checkpoints: MatchState[];
  /** The first step of each turn (the step whose result is that turn's main phase). */
  turnStarts: { turn: number; step: number }[];
  /** State after the last step that could be replayed. */
  final: MatchState;
  /** Set when the engine refused a recorded intent; steps before it are still here. */
  diverged?: { atIntent: number; intentType: string; message: string };
  /** Leaders, Characters and Stages that were ever on the board, to name attackers and blockers in the log. */
  boardCards: Map<InstanceId, { defId: CardDefId; seat: Seat }>;
}

export const DEFAULT_CHECKPOINT_EVERY = 16;

function indexBoard(state: MatchState, into: Map<InstanceId, { defId: CardDefId; seat: Seat }>) {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])]) {
      if (!into.has(c.id)) into.set(c.id, { defId: c.defId, seat });
    }
  }
}

/** Builds the timeline a few intents at a time so a page can stay responsive and show progress. */
export function createTimelineBuilder(replay: MatchReplay, opts: { every?: number } = {}) {
  const every = Math.max(1, Math.floor(opts.every ?? DEFAULT_CHECKPOINT_EVERY));
  // Throws if the match cannot even be dealt (for example an unknown card id).
  const start = replayStart(replay);
  const steps: TimelineStep[] = [];
  const checkpoints: MatchState[] = [start];
  const turnStarts: { turn: number; step: number }[] = [{ turn: start.turnNumber, step: 0 }];
  const boardCards = new Map<InstanceId, { defId: CardDefId; seat: Seat }>();
  indexBoard(start, boardCards);
  let state = start;
  let diverged: ReplayTimeline["diverged"];
  let done = replay.intents.length === 0;

  return {
    /** Replay up to `maxIntents` more intents. Returns true once the whole recording (or its replayable part) is built. */
    advance(maxIntents: number): boolean {
      for (let n = 0; n < maxIntents && !done; n++) {
        const i = steps.length;
        const { seat, intent } = replay.intents[i]!;
        try {
          const applied = replayApply(state, replay, i);
          const before = state;
          state = applied.state;
          steps.push({ seat, intentType: intent.type, turnNumber: state.turnNumber, activeSeat: state.activeSeat, phase: state.phase, events: applied.events });
          if (state.turnNumber !== before.turnNumber) turnStarts.push({ turn: state.turnNumber, step: steps.length });
          if (steps.length % every === 0) checkpoints.push(state);
          indexBoard(state, boardCards);
        } catch (err) {
          diverged = { atIntent: i, intentType: intent.type, message: err instanceof Error ? err.message : String(err) };
          done = true;
          break;
        }
        if (steps.length >= replay.intents.length) done = true;
      }
      return done;
    },
    /** 0 to 1. */
    progress(): number {
      if (done) return 1;
      return replay.intents.length === 0 ? 1 : steps.length / replay.intents.length;
    },
    result(): ReplayTimeline {
      return { replay, start, steps, every, checkpoints, turnStarts, final: state, ...(diverged ? { diverged } : {}), boardCards };
    },
  };
}

/** Build the whole timeline at once (tests, tools). */
export function buildReplayTimeline(replay: MatchReplay, opts: { every?: number } = {}): ReplayTimeline {
  const builder = createTimelineBuilder(replay, opts);
  builder.advance(Number.MAX_SAFE_INTEGER);
  return builder.result();
}

/**
 * The state after `step` intents. Starts from the nearest checkpoint at or before it, or from `near`
 * (a state the caller already holds) when that is closer, and re-applies intents forward.
 */
export function timelineStateAt(t: ReplayTimeline, step: number, near?: { step: number; state: MatchState }): MatchState {
  const target = Math.min(Math.max(0, Math.floor(step)), t.steps.length);
  const k = Math.floor(target / t.every);
  let from = k * t.every;
  let state = t.checkpoints[k]!;
  if (near && near.step <= target && near.step > from) {
    from = near.step;
    state = near.state;
  }
  for (let i = from; i < target; i++) state = replayApply(state, t.replay, i).state;
  return state;
}

/**
 * Spectator board for one step. `cameraSeat` only decides which side is drawn at the bottom;
 * what is shown is decided by `viewerSeat` and `revealAll`, so flipping the camera never leaks a hand.
 * Deck order and face-down Life are never in the spectator view, only counts.
 */
export function getReplayView(state: MatchState, o: { cameraSeat: Seat; viewerSeat: Seat; revealAll: boolean }) {
  const base = getSpectatorView(state, o.cameraSeat, { revealHands: true });
  const hands = base.revealedHands!;
  const mask = (seat: Seat) => (o.revealAll || seat === o.viewerSeat ? hands[seat] : null);
  return {
    ...base,
    revealedHands: [mask(0), mask(1)] as [{ id: string; defId: string }[] | null, { id: string; defId: string }[] | null],
    pendingChoices: state.pendingChoices.map((c) => projectPendingChoice(c, o.viewerSeat)),
    pendingTrigger: state.pendingChoices[0]?.kind === "life_trigger" ? { seat: state.pendingChoices[0].seat, cardDefId: state.pendingChoices[0].seat === o.viewerSeat ? state.pendingChoices[0].cardDefId : "HIDDEN" } : null,
  };
}

/**
 * Events as the viewer should read them. "What I saw" hides what the viewer could not see.
 * "Reveal all" shows each event as its own seat saw it (an opponent's draw is named), but
 * a face-down Life card stays hidden from everyone.
 */
export function projectReplayEvents(events: GameEvent[], viewerSeat: Seat, revealAll: boolean): GameEvent[] {
  if (!revealAll) return projectGameEvents(events, viewerSeat);
  return events.flatMap((e) => projectGameEvents([e], "seat" in e && typeof e.seat === "number" ? e.seat : null));
}
