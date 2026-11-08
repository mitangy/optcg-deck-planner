/**
 * Everything the replay page needs from a recording: the timeline built in the background,
 * where you are in it, and the board view and battle log for that moment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTimelineBuilder,
  projectReplayEvents,
  REGISTRY_HASH,
  RULES_VERSION,
  type GameEvent,
  type InstanceId,
  type Intent,
  type MatchState,
  type ReplayTimeline,
} from "@optcg/rules/replay/replayTimeline";
import { applyBranchIntent, getLiveReplayViews, hideFarHand, indexBoardCards } from "@optcg/rules/replay/replayBranch";
import { narrateEvents, type BattleLogEntry } from "../board/match/battleLog";
import { hotseatControlSeat } from "../board/match/hotseatControlSeat";
import type { Intent as WireIntent, PlayerView, Seat } from "../net/protocol";
import type { ReplayPayload } from "./replayApi";
import { createReplayCursor, nextTurnStep, playDelay, prevTurnStep, turnAtStep, turnStep, type PlaySpeed } from "./replayCursor";
import { replayStatus, type ReplayStatus } from "./replayStatus";
import { backToGameStep, currentState, openBranch, playMove, undoMove, type Branch, type MoveApplier, type RecordedMove } from "./replayBranch";

/** A line the viewer is playing that the recording did not (#966); see replayBranch.ts. */
export type ReplayBranch = Branch<MatchState, Intent, GameEvent>;

/** Intents rebuilt per slice, so the page stays responsive and can show progress. */
const BUILD_SLICE = 40;

export type ReplayControlsState = {
  step: number;
  total: number;
  turn: number;
  turns: { turn: number; step: number }[];
  playing: boolean;
  speed: PlaySpeed;
  revealAll: boolean;
  cameraSeat: Seat;
  /** The viewer's own seat: whose side "What I saw" follows. */
  yourSeat: Seat;
  playerNames: [string, string];
  /** Set while the viewer plays a line of their own: the turn it left the recording on and how many moves it holds. */
  branch: { turn: number; moves: number } | null;
};

export type ReplayControlsActions = {
  togglePlay(): void;
  stepBy(delta: number): void;
  goTo(step: number): void;
  prevTurn(): void;
  nextTurn(): void;
  goTurn(turn: number): void;
  setSpeed(speed: PlaySpeed): void;
  setRevealAll(on: boolean): void;
  /** Take back the last move of the viewer's line; the last one back returns to the recording. */
  undoMove(): void;
  /** Leave the viewer's line and return to the step it started from on the recording. */
  backToGame(): void;
  /**
   * Open a line at main-line `step` with `moves` already played (for example the best move, #967). Pauses playback.
   * Returns an error message when the engine refuses one of the moves (nothing is opened then), otherwise null.
   */
  startBranch(step: number, moves: readonly RecordedMove<Intent>[]): string | null;
};

export type Replay =
  | { phase: "building"; progress: number }
  | { phase: "unavailable"; status: Extract<ReplayStatus, { kind: "unavailable" }> }
  | {
      phase: "ready";
      status: ReplayStatus;
      timeline: ReplayTimeline;
      view: PlayerView;
      battleLog: BattleLogEntry[];
      /** True for any move other than one step forward or playback: no sounds or card spotlights. A move the viewer makes is not quiet. */
      quiet: boolean;
      /** The board is live: send the viewer's move here. */
      sendIntent(intent: WireIntent): void;
      /** Why the last move was refused, until the next move or step. */
      error: string | null;
      clearError(): void;
      atEnd: boolean;
      controls: ReplayControlsState;
      actions: ReplayControlsActions;
    };

type Build = { phase: "building"; progress: number } | { phase: "failed" } | { phase: "done"; timeline: ReplayTimeline };

/** The engine as the viewer's own moves meet it: the recording's seed, no reseeds (those belong to recorded intents). */
function applier(timeline: ReplayTimeline): MoveApplier<MatchState, Intent, GameEvent> {
  return (state, seat, intent) => applyBranchIntent(state, timeline.replay, seat, intent);
}

export function useReplay(payload: ReplayPayload): Replay {
  const { replay, your_seat: yourSeat } = payload;
  const [build, setBuild] = useState<Build>({ phase: "building", progress: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setBuild({ phase: "building", progress: 0 });
    let builder: ReturnType<typeof createTimelineBuilder>;
    try {
      builder = createTimelineBuilder(replay);
    } catch {
      setBuild({ phase: "failed" });
      return;
    }
    const slice = () => {
      if (cancelled) return;
      let done: boolean;
      try {
        done = builder.advance(BUILD_SLICE);
      } catch {
        setBuild({ phase: "failed" });
        return;
      }
      if (done) setBuild({ phase: "done", timeline: builder.result() });
      else {
        setBuild({ phase: "building", progress: builder.progress() });
        timer = window.setTimeout(slice, 0);
      }
    };
    timer = window.setTimeout(slice, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [replay]);

  const timeline = build.phase === "done" ? build.timeline : null;
  const total = timeline?.steps.length ?? 0;
  const [step, setStep] = useState(0);
  const [quiet, setQuiet] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  const [revealAll, setRevealAll] = useState(true);
  const [branch, setBranch] = useState<ReplayBranch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep(0);
    setQuiet(true);
    setPlaying(false);
    setBranch(null);
    setError(null);
  }, [replay, yourSeat]);

  const cursor = useMemo(() => (timeline ? createReplayCursor(timeline) : null), [timeline]);

  // Playback: one step per tick; a new turn lingers a little.
  useEffect(() => {
    if (!playing || !timeline) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const crossesTurn = timeline.turnStarts.some((s) => s.step === step + 1);
    const id = window.setTimeout(() => {
      setQuiet(false);
      setStep(step + 1);
    }, playDelay(speed, crossesTurn));
    return () => window.clearTimeout(id);
  }, [playing, step, speed, timeline, total]);

  const stepRef = useRef(step);
  stepRef.current = step;
  const branchRef = useRef(branch);
  branchRef.current = branch;
  // Any main-line control leaves the viewer's line.
  const goTo = useCallback(
    (next: number, opts: { quiet?: boolean } = {}) => {
      const clamped = Math.min(Math.max(0, Math.round(next)), total);
      setQuiet(opts.quiet ?? true);
      setBranch(null);
      setError(null);
      setStep(clamped);
    },
    [total],
  );

  const actions = useMemo<ReplayControlsActions>(
    () => ({
      togglePlay() {
        setBranch(null);
        setError(null);
        setPlaying((on) => {
          if (on) return false;
          // Play from the end starts over.
          if (stepRef.current >= total) {
            setQuiet(true);
            setStep(0);
          }
          return true;
        });
      },
      stepBy(delta) {
        setPlaying(false);
        goTo(stepRef.current + delta, { quiet: delta !== 1 });
      },
      goTo(next) {
        goTo(next);
      },
      prevTurn() {
        if (timeline) goTo(prevTurnStep(timeline, stepRef.current));
      },
      nextTurn() {
        if (timeline) goTo(nextTurnStep(timeline, stepRef.current));
      },
      goTurn(turn) {
        const target = timeline ? turnStep(timeline, turn) : null;
        if (target != null) goTo(target);
      },
      setSpeed,
      setRevealAll,
      undoMove() {
        const open = branchRef.current;
        if (!open) return;
        setError(null);
        setQuiet(true);
        const left = undoMove(open);
        if (left) setBranch(left);
        else {
          setBranch(null);
          setStep(backToGameStep(open));
        }
      },
      backToGame() {
        const open = branchRef.current;
        if (!open) return;
        setPlaying(false);
        goTo(backToGameStep(open));
      },
      startBranch(at, moves) {
        if (!timeline || !cursor) return "The replay is not ready";
        const from = Math.min(Math.max(0, Math.round(at)), total);
        const opened = openBranch(from, cursor.stateAt(from), moves, applier(timeline));
        if (!opened.ok) return opened.message;
        setPlaying(false);
        setError(null);
        setQuiet(false);
        setStep(from);
        setBranch(opened.branch);
        return null;
      },
    }),
    [goTo, timeline, cursor, total],
  );

  const mainState = useMemo(() => (cursor ? cursor.stateAt(step) : null), [cursor, step]);
  const state = useMemo(() => (mainState ? currentState(mainState, branch) : null), [mainState, branch]);

  // The board is live: the view is the player view of the seat that has to act, like hotseat without the hand-off.
  const live = useMemo(() => {
    if (!state) return null;
    const [v0, v1] = getLiveReplayViews(state);
    const control = hotseatControlSeat(null, v0 as unknown as PlayerView, v1 as unknown as PlayerView) ?? state.activeSeat;
    const seatView = control === 0 ? v0 : v1;
    return { control, view: (revealAll ? seatView : hideFarHand(seatView, yourSeat)) as unknown as PlayerView };
  }, [state, revealAll, yourSeat]);
  const view = live?.view ?? null;
  const cameraSeat: Seat = live?.control ?? yourSeat;
  const controlRef = useRef(cameraSeat);
  controlRef.current = cameraSeat;

  const sendIntent = useCallback(
    (wire: WireIntent) => {
      if (!timeline || !cursor) return;
      const at = stepRef.current;
      const outcome = playMove(
        { step: at, branch: branchRef.current, mainState: cursor.stateAt(at), recorded: timeline.replay.intents },
        { seat: controlRef.current, intent: wire as unknown as Intent },
        applier(timeline),
      );
      if (outcome.kind === "illegal") {
        setError(outcome.message);
        return;
      }
      setError(null);
      setPlaying(false);
      setQuiet(false);
      // A handler can send several moves in one go (one give_don per DON, one counter per card) before React
      // re-renders, so the next send must already see this one: move the refs now, not on the next render (#971).
      if (outcome.kind === "advance") {
        stepRef.current = outcome.step;
        setStep(outcome.step);
      } else {
        branchRef.current = outcome.branch;
        setBranch(outcome.branch);
      }
    },
    [timeline, cursor],
  );

  // Narrate every step once per mode (log ids are random), then show the lines up to the current step.
  const narration = useMemo(() => {
    if (!timeline) return null;
    const lines: BattleLogEntry[] = [];
    const upTo: number[] = [0];
    for (const s of timeline.steps) {
      lines.push(
        ...narrateEvents(projectReplayEvents(s.events, yourSeat, revealAll), {
          youSeat: yourSeat,
          turnNumber: s.turnNumber,
          instances: timeline.boardCards,
        }),
      );
      upTo.push(lines.length);
    }
    return { lines, upTo };
  }, [timeline, yourSeat, revealAll]);
  const mainLog = useMemo(() => (narration ? narration.lines.slice(0, narration.upTo[step] ?? 0) : []), [narration, step]);
  // On a line of the viewer's own, the log is the recording up to where it left, then what the line has done.
  const battleLog = useMemo(() => {
    if (!branch || !timeline) return mainLog;
    const instances = new Map<InstanceId, { defId: string; seat: Seat }>(timeline.boardCards);
    for (const s of branch.states) indexBoardCards(s, instances);
    const own = branch.moves.flatMap((m, k) =>
      narrateEvents(projectReplayEvents(m.events, yourSeat, revealAll), {
        youSeat: yourSeat,
        turnNumber: branch.states[k + 1]!.turnNumber,
        instances,
      }),
    );
    return [...mainLog, ...own];
  }, [mainLog, branch, timeline, yourSeat, revealAll]);

  const status = useMemo(() => {
    if (build.phase === "building") return null;
    return replayStatus({
      replay,
      current: { rulesVersion: RULES_VERSION, registryHash: REGISTRY_HASH },
      startFailed: build.phase === "failed",
      timeline: timeline
        ? { steps: timeline.steps.length, diverged: timeline.diverged, winner: timeline.final.winner, turnNumber: timeline.final.turnNumber }
        : null,
      recordedTurns: payload.turns,
    });
  }, [build, replay, timeline, payload.turns]);

  if (build.phase === "building") return { phase: "building", progress: build.progress };
  if (!timeline || !view || !status || status.kind === "unavailable") {
    return { phase: "unavailable", status: status?.kind === "unavailable" ? status : { kind: "unavailable", reason: "start" } };
  }
  return {
    phase: "ready",
    status,
    timeline,
    view,
    battleLog,
    quiet,
    sendIntent,
    error,
    clearError: () => setError(null),
    atEnd: !branch && step >= total,
    controls: {
      step,
      total,
      turn: turnAtStep(timeline, step),
      turns: timeline.turnStarts,
      playing,
      speed,
      revealAll,
      cameraSeat,
      yourSeat,
      playerNames: payload.players,
      branch: branch ? { turn: branch.states[0]!.turnNumber, moves: branch.moves.length } : null,
    },
    actions,
  };
}
