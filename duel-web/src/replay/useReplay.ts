/**
 * Everything the replay page needs from a recording: the timeline built in the background,
 * where you are in it, and the board view and battle log for that moment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTimelineBuilder,
  getReplayView,
  projectReplayEvents,
  REGISTRY_HASH,
  RULES_VERSION,
  type ReplayTimeline,
} from "@optcg/rules/replayTimeline";
import { narrateEvents, type BattleLogEntry } from "../board/battleLog";
import type { PlayerView, Seat } from "../net/protocol";
import type { ReplayPayload } from "./replayApi";
import { createReplayCursor, nextTurnStep, playDelay, prevTurnStep, turnAtStep, turnStep, type PlaySpeed } from "./replayCursor";
import { replayStatus, type ReplayStatus } from "./replayStatus";

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
  flip(): void;
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
      /** True for any move other than one step forward or playback: no sounds or card spotlights. */
      quiet: boolean;
      atEnd: boolean;
      controls: ReplayControlsState;
      actions: ReplayControlsActions;
    };

type Build = { phase: "building"; progress: number } | { phase: "failed" } | { phase: "done"; timeline: ReplayTimeline };

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
  const [cameraSeat, setCameraSeat] = useState<Seat>(yourSeat);

  useEffect(() => {
    setStep(0);
    setQuiet(true);
    setPlaying(false);
    setCameraSeat(yourSeat);
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
  const goTo = useCallback(
    (next: number, opts: { quiet?: boolean } = {}) => {
      const clamped = Math.min(Math.max(0, Math.round(next)), total);
      setQuiet(opts.quiet ?? true);
      setStep(clamped);
    },
    [total],
  );

  const actions = useMemo<ReplayControlsActions>(
    () => ({
      togglePlay() {
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
      flip() {
        setCameraSeat((s) => (1 - s) as Seat);
      },
    }),
    [goTo, timeline, total],
  );

  const state = useMemo(() => (cursor ? cursor.stateAt(step) : null), [cursor, step]);
  const view = useMemo(
    () => (state ? (getReplayView(state, { cameraSeat, viewerSeat: yourSeat, revealAll }) as unknown as PlayerView) : null),
    [state, cameraSeat, yourSeat, revealAll],
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
  const battleLog = useMemo(() => (narration ? narration.lines.slice(0, narration.upTo[step] ?? 0) : []), [narration, step]);

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
    atEnd: step >= total,
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
    },
    actions,
  };
}
