import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ticketGameKey, useLogPose, useLogPoseGame, type ChoiceAnswer, type GameAskResult, type GameChatContext, type LogPoseGame, type TurnPlan } from "@optcg/analyst-client";
import { lookupCard } from "../cards/atlas";
import { setBoardCopilot } from "../logPose";
import type { BriefTicketWire, Intent, PlayerView, Seat } from "../net/protocol";
import { useDuelSettings } from "../settings";
import type { BattleLogEntry } from "./battleLog";
import { describeBattle } from "./battleBanner";
import {
  AUTO_CAP_REASON,
  AUTO_UNDECIDED_REASON,
  autoAsk,
  autoAskAllowed,
  buildSnapshot,
  choiceAnswerIntent,
  copilotAvailable,
  copilotShown,
  gameAttached,
  planCardMode,
  playBlockReason,
  recentLog,
  replanQuestion,
  runActive,
  skipStep,
  startRun,
  stepRun,
  stepRunOtherSeat,
  stopRun,
  type AutoAsk,
  type PlanCardMode,
  type PlanRun,
} from "./copilot";
import "./copilot.css";

export type CopilotLayout = "desktop" | "portrait" | "landscape";

export const COPILOT_STARTERS = ["What's my best play this turn?", "Plan my turn", "Should I block or counter?"];

/** A speech bubble with a compass needle in it: not the Brief button's bare compass, so the two sit side by side apart. */
function CopilotGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg className="hud-brief-icon" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H9.2L5.6 16.8a.5.5 0 0 1-.8-.4V14h-.3A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 5.6l1.7 3.9L10 11.9 8.3 9.5z" fill="currentColor" />
    </svg>
  );
}

// ——— The plan being played, shared between the board (the executor) and the panel (the cards) ———

type CopilotSnap = {
  view: PlayerView | null;
  /** The one plan that is running now (or the last one to finish, for the pill to drop). */
  run: PlanRun | null;
  /** Runs that finished, by plan id, so their cards keep saying how it went. */
  finished: Record<string, PlanRun>;
  /** Log Pose is playing the turn: waiting for the board, or asking Log Pose what to do next. Null when it is not. */
  auto: "waiting" | "asking" | null;
};

function createStore() {
  let snap: CopilotSnap = { view: null, run: null, finished: {}, auto: null };
  const listeners = new Set<() => void>();
  return {
    get: () => snap,
    set(patch: Partial<CopilotSnap>) {
      snap = { ...snap, ...patch };
      // A run that ended is remembered under its plan, whatever ended it.
      const run = snap.run;
      if (run && (run.state === "done" || run.state === "stopped") && snap.finished[run.plan.id] !== run) snap = { ...snap, finished: { ...snap.finished, [run.plan.id]: run } };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
type Store = ReturnType<typeof createStore>;

type Actions = { play: (plan: TurnPlan) => void; stop: () => void; skip: () => void };

/** The Turn plan card: every step the plan will play, and the only way to start it. Nothing is sent until Play this turn. */
export function TurnPlanCard({
  plan,
  mode,
  busy,
  onPlay,
  onStop,
  onSkip,
  onReplan,
}: {
  plan: TurnPlan;
  mode: PlanCardMode;
  /** Log Pose is answering: Re-plan waits. */
  busy: boolean;
  onPlay: () => void;
  onStop: () => void;
  onSkip: () => void;
  onReplan: (step: number, reason: string) => void;
}) {
  const current = mode.kind === "running" || mode.kind === "choice" || mode.kind === "blocked" ? mode.step : -1;
  const reached = mode.kind === "stopped" || mode.kind === "done" ? (mode.kind === "done" ? plan.steps.length : mode.step) : current;
  let status: string;
  switch (mode.kind) {
    case "idle":
      status = mode.disabledReason ?? "Nothing is played until you tap Play this turn.";
      break;
    case "running":
      status = `${mode.auto ? "Log Pose is playing" : "Playing"} step ${mode.step + 1} of ${plan.steps.length}`;
      break;
    case "choice":
      status = mode.auto ? "Log Pose is answering the prompt, then the plan continues" : "Your call: answer the prompt, then the plan continues";
      break;
    case "blocked":
      status = `Step ${mode.step + 1} can't be played: ${mode.reason}${mode.auto ? " Log Pose is planning the rest." : ""}`;
      break;
    case "done":
      status = "Done. Every step was played.";
      break;
    case "stopped":
      status = `${mode.step >= plan.steps.length ? "Played every step." : `Stopped before step ${mode.step + 1}.`}${mode.reason ? ` ${mode.reason}` : ""}`;
      break;
  }
  return (
    <section className="copilot-plan" data-state={mode.kind} aria-label="Turn plan">
      <h3 className="copilot-plan-title">Turn plan</h3>
      <p className="copilot-plan-summary">{plan.summary}</p>
      <ol className="copilot-steps">
        {plan.steps.map((s, i) => (
          <li
            key={i}
            className="copilot-step"
            data-current={i === current ? "true" : undefined}
            data-done={i < reached && i !== current ? "true" : undefined}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="copilot-step-label">{s.label}</span>
            {s.why ? <span className="copilot-step-why">{s.why}</span> : null}
          </li>
        ))}
      </ol>
      <p className="copilot-plan-status" role="status" data-kind={mode.kind}>
        {status}
      </p>
      <div className="copilot-plan-actions">
        {mode.kind === "idle" ? (
          <button type="button" className="lp-btn copilot-btn copilot-btn-primary" disabled={mode.disabledReason != null} onClick={onPlay}>
            Play this turn
          </button>
        ) : null}
        {mode.kind === "blocked" && !mode.auto ? (
          <>
            <button type="button" className="lp-btn copilot-btn" onClick={onSkip}>
              Skip step
            </button>
            <button type="button" className="lp-btn copilot-btn" disabled={busy} onClick={() => onReplan(mode.step, mode.reason)}>
              Re-plan
            </button>
          </>
        ) : null}
        {mode.kind === "running" || mode.kind === "choice" || mode.kind === "blocked" ? (
          <button type="button" className="lp-btn copilot-btn copilot-btn-stop" onClick={onStop}>
            Stop
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Subscribes one card to the shared run, so it follows the plan without the panel re-registering anything. */
function PlanCardConnector({ plan, store, actions, gameKey, ctx }: { plan: TurnPlan; store: Store; actions: Actions; gameKey: string | null; ctx: { busy: boolean; ask: (text: string) => void } }) {
  const snap = useSyncExternalStore(store.subscribe, store.get, store.get);
  const own = snap.run?.plan.id === plan.id ? snap.run : (snap.finished[plan.id] ?? null);
  const mode = planCardMode(plan, own, snap.run, snap.view, gameKey);
  return (
    <TurnPlanCard
      plan={plan}
      mode={mode}
      busy={ctx.busy}
      onPlay={() => actions.play(plan)}
      onStop={actions.stop}
      onSkip={actions.skip}
      onReplan={(step, reason) => {
        actions.stop();
        ctx.ask(replanQuestion(plan, step, reason));
      }}
    />
  );
}

/** Under the top bar (or the top edge when there is none): where the pill sits. */
function useBarBottom(on: boolean): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (!on) return;
    const measure = () => setTop(Math.round(document.querySelector<HTMLElement>(".arena .hud-bar")?.getBoundingClientRect().bottom ?? 0));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [on]);
  return top;
}

function CopilotPill({ run, auto, onStop }: { run: PlanRun | null; auto: CopilotSnap["auto"]; onStop: () => void }) {
  const top = useBarBottom(true);
  const playing = run?.auto === true || (run === null && auto !== null);
  let text: string;
  if (!run) text = auto === "asking" ? "Log Pose is playing · deciding" : "Log Pose is playing";
  else {
    const step = Math.min(run.cursor.step + 1, run.plan.steps.length);
    const note = run.state === "choice" ? (playing ? "choosing" : "your call") : run.state === "blocked" ? (playing ? "re-planning" : "needs you") : null;
    text = `${playing ? "Log Pose is playing" : "Log Pose"} · step ${step} of ${run.plan.steps.length}${note ? ` · ${note}` : ""}`;
  }
  const style: CSSProperties = { top: top + 6 };
  const el = (
    <div className="logpose copilot-pill" data-state={run?.state ?? "running"} data-auto={playing ? "true" : undefined} style={style} role="status">
      <span className="copilot-pill-dot" aria-hidden="true" />
      <span className="copilot-pill-text">{text}</span>
      <button type="button" className="copilot-pill-stop" onClick={onStop}>
        Stop
      </button>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(el, document.body);
}

/**
 * The Log Pose copilot for a casual or practice game: a Log Pose button for the top bar (or the landscape rail), the
 * live game as Log Pose's context, Turn plan cards under its answers, and the executor that plays an approved plan one
 * legal intent at a time with a Stop pill on the board. Nothing renders, registers or sends unless `copilotShown`.
 */
export function useLogPoseCopilot(o: {
  source: { brief: BriefTicketWire | null; ranked: boolean | null } | null | undefined;
  role: "player" | "spectator";
  view: PlayerView | null | undefined;
  battleLog: readonly BattleLogEntry[];
  onSendIntent: (intent: Intent) => void;
  over: boolean;
  layout: CopilotLayout;
  /** The seat the ticket was minted for: your own seat online, seat 0 in hotseat. */
  ticketSeat: Seat | null | undefined;
  /** The board's error banner: a refused move stops the plan. */
  errorBanner?: string | null;
}): { shown: boolean; trigger: ReactNode; railTrigger: ReactNode; pill: ReactNode } {
  const { enabled, openPanel, askGame, stopGameAsk } = useLogPose();
  const settings = useDuelSettings();
  const brief = o.source?.brief ?? null;
  const view = o.view ?? null;
  const gate = {
    ranked: o.source?.ranked ?? null,
    role: o.role,
    brief,
    logPoseEnabled: enabled,
    setting: settings.logPoseCopilot,
    ticketSeat: o.ticketSeat,
  };
  // Offered: the plan, its card and the panel stay. Shown: the button too, on the ticket's own seat's view only.
  const offered = copilotAvailable(gate);
  // Attached: the live game is Log Pose's context, also when only the matchup brief opened its panel (no copilot setting).
  const attached = gameAttached({ ...gate, briefSetting: settings.matchBrief });
  const shown = copilotShown({ ...gate, viewSeat: view?.seat });

  const store = useMemo(createStore, []);
  const ticketRef = useRef<string | null>(null);
  ticketRef.current = brief?.ticket ?? null;
  const gameKeyNow = () => (ticketRef.current ? ticketGameKey(ticketRef.current) : null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const logRef = useRef(o.battleLog);
  logRef.current = o.battleLog;
  const sendRef = useRef(o.onSendIntent);
  sendRef.current = o.onSendIntent;
  const planningRef = useRef(offered);
  planningRef.current = offered;
  const ticketSeatRef = useRef(o.ticketSeat);
  ticketSeatRef.current = o.ticketSeat;
  const askRef = useRef(askGame);
  askRef.current = askGame;
  const stopAskRef = useRef(stopGameAsk);
  stopAskRef.current = stopGameAsk;

  /**
   * Log Pose playing the turn (#725). One session per turn: it starts when a live autoplay plan arrives, answers the
   * run's pending choices and plans on when the run ends early, makes at most AUTO_ASK_CAP requests, and ends the moment the
   * player stops it, the turn or game ends, or Log Pose cannot decide. Nothing here runs for a plan read back from a saved chat.
   */
  const auto = useMemo(() => {
    type Session = { turn: number; asks: number; fired: Set<string>; answered: Set<string>; ctrl: AbortController; inFlight: boolean };
    let session: Session | null = null;
    const apply = (run: PlanRun, v: PlayerView) => {
      const r = stepRun(run, v);
      store.set({ run: r.run });
      if (r.send) sendRef.current(r.send);
    };
    /** Ends the session; `reason` is shown on the run's card (also when it had already finished all its steps). */
    const end = (reason?: string) => {
      const s = session;
      session = null;
      if (s) {
        s.ctrl.abort();
        if (s.inFlight) stopAskRef.current();
      }
      const run = store.get().run;
      if (runActive(run)) store.set({ run: stopRun(run, reason), auto: null });
      else {
        const last = store.get().run;
        if (s && reason && last?.auto && (last.state === "done" || last.state === "stopped")) {
          store.set({ run: { ...last, state: "stopped", reason: last.state === "stopped" && last.reason ? `${last.reason} ${reason}` : reason }, auto: null });
        } else store.set({ auto: null });
      }
    };
    const ask = (a: AutoAsk) => {
      const s = session;
      if (!s) return;
      if (!autoAskAllowed(s.asks)) return end(AUTO_CAP_REASON);
      s.fired.add(a.key);
      s.asks += 1;
      s.inFlight = true;
      store.set({ auto: "asking" });
      void askRef.current(a.text, { auto: true, signal: s.ctrl.signal }).then((res: GameAskResult) => {
        if (session !== s) return;
        s.inFlight = false;
        if (res.aborted) end("You stopped it.");
        else if (!res.sent || res.error || (!res.plan && !res.choice)) end(AUTO_UNDECIDED_REASON);
        else {
          store.set({ auto: "waiting" });
          // The board may have moved on while Log Pose answered (no new view is coming to ask about it).
          const v = viewRef.current;
          if (v && v.seat === ticketSeatRef.current) drive(v);
        }
      });
    };
    /**
     * A fresh view. The session ends with the turn or the game, whichever seat the device shows; on the ticket's own
     * seat's view it also asks Log Pose what comes next, if anything does.
     */
    const drive = (v: PlayerView, mine = true) => {
      const s = session;
      if (!s) return;
      if (v.winner != null || v.turnNumber !== s.turn) return end();
      if (!mine) return;
      const run = store.get().run;
      if (run?.auto && run.state === "stopped") return end();
      if (s.inFlight) return;
      const a = autoAsk(run, v, s.fired);
      if (a) ask(a);
    };
    return {
      get active() {
        return session !== null;
      },
      /** A plan Log Pose proposed to play now has just streamed in. */
      onLivePlan(plan: TurnPlan) {
        if (!plan.autoplay || !planningRef.current) return;
        const cur = viewRef.current;
        if (!cur || cur.seat !== ticketSeatRef.current) return;
        // A step that was blocked is replaced by the plan Log Pose just made for the rest of the turn.
        const run = store.get().run;
        if (session && runActive(run) && run.auto && run.state === "blocked") store.set({ run: stopRun(run, run.reason) });
        const why = playBlockReason(plan, cur, store.get().run, gameKeyNow());
        if (why) return session ? end(why) : undefined;
        if (!session || session.turn !== plan.turn) {
          session?.ctrl.abort();
          session = { turn: plan.turn, asks: 0, fired: new Set(), answered: new Set(), ctrl: new AbortController(), inFlight: false };
        }
        store.set({ auto: session.inFlight ? "asking" : "waiting" });
        apply(startRun(plan, true), cur);
      },
      /** Log Pose has answered a pending choice: carried out only if it names the choice on the table now. */
      onLiveChoice(answer: ChoiceAnswer) {
        const s = session;
        const v = viewRef.current;
        if (!s || !v || (answer.gameKey && answer.gameKey !== gameKeyNow())) return;
        const front = v.pendingChoices?.[0];
        // Already answered, or the player answered it themselves while Log Pose was deciding: nothing to apply.
        if (s.answered.has(answer.choiceId) || !front) return;
        const intent = v.seat === ticketSeatRef.current ? choiceAnswerIntent(front, answer, v.seat, (defId) => lookupCard(defId).name) : null;
        if (!intent) return end("Log Pose's answer didn't fit the prompt. It's your call.");
        s.answered.add(front.id);
        sendRef.current(intent);
      },
      drive,
      end,
    };
  }, [store]);

  const actions = useMemo<Actions>(() => {
    const apply = (run: PlanRun, v: PlayerView) => {
      const r = stepRun(run, v);
      store.set({ run: r.run });
      if (r.send) sendRef.current(r.send);
    };
    return {
      play: (plan) => {
        const { view: v, run } = store.get();
        const cur = viewRef.current ?? v;
        if (!cur || playBlockReason(plan, cur, run, gameKeyNow()) !== null) return;
        apply(startRun(plan), cur);
      },
      stop: () => {
        if (auto.active) return auto.end("You stopped it.");
        const run = store.get().run;
        if (runActive(run)) store.set({ run: stopRun(run, "You stopped it.") });
      },
      skip: () => {
        const run = store.get().run;
        const cur = viewRef.current;
        if (!runActive(run) || !cur) return;
        apply(skipStep(run), cur);
      },
    };
  }, [store, auto]);

  const game = useMemo<LogPoseGame>(
    () => ({
      label: "this game",
      starters: COPILOT_STARTERS,
      context: (): GameChatContext | null => {
        const v = viewRef.current;
        const ticket = ticketRef.current;
        // The ticket is one seat's: a view from the other seat (hotseat) is never sent with it.
        if (!v || !ticket || v.seat !== ticketSeatRef.current) return null;
        const battle = v.battle ? describeBattle(v, (defId) => lookupCard(defId).name, true) : null;
        const log = recentLog(logRef.current);
        return { ticket, snapshot: buildSnapshot(v, battle, v.pendingChoices?.[0]), plans: planningRef.current, ...(log.length ? { log } : {}) };
      },
      renderPlan: (plan, ctx) => <PlanCardConnector key={plan.id} plan={plan} store={store} actions={actions} gameKey={gameKeyNow()} ctx={ctx} />,
      onLivePlan: auto.onLivePlan,
      onLiveChoice: auto.onLiveChoice,
    }),
    [store, actions, auto],
  );
  useLogPoseGame(attached ? game : null);

  // Log Pose may open over the board while the copilot is on.
  useEffect(() => {
    setBoardCopilot(offered);
    return () => setBoardCopilot(false);
  }, [offered]);

  // The executor: every fresh view moves the approved plan on by at most one intent.
  const { over } = o;
  useEffect(() => {
    if (!view) return;
    store.set({ view });
    const run = store.get().run;
    const mine = view.seat === ticketSeatRef.current;
    if (runActive(run)) {
      if (!offered) store.set({ run: stopRun(run, "Log Pose left the board.") });
      else if (over) store.set({ run: stopRun(run, "The game is over.") });
      // Hotseat: the device shows the other seat (the defender answering the attack). The plan waits for its seat.
      else if (!mine) store.set({ run: stepRunOtherSeat(run, view) });
      else {
        const r = stepRun(run, view);
        store.set({ run: r.run });
        if (r.send) sendRef.current(r.send);
      }
    }
    // Log Pose playing the turn: it ends with the board, and otherwise asks what comes next from the player's own seat.
    if (!auto.active) return;
    if (!offered || over) auto.end();
    else auto.drive(view, mine);
  }, [view, offered, over, store, auto]);

  // Leaving the board ends it: no request goes out after.
  useEffect(
    () => () => {
      if (auto.active) auto.end();
    },
    [auto],
  );

  // A refused move ends the plan: it was built on a board that is no longer the one on screen.
  const banner = o.errorBanner ?? null;
  useEffect(() => {
    if (!banner) return;
    if (auto.active) return auto.end(`The game refused a move (${banner}).`);
    const run = store.get().run;
    if (runActive(run)) store.set({ run: stopRun(run, `The game refused a move (${banner}).`) });
  }, [banner, store, auto]);

  // Only the running plan matters here, so a fresh view alone never re-renders the board a second time.
  const activeRun = useSyncExternalStore(
    store.subscribe,
    () => {
      const run = store.get().run;
      return runActive(run) ? run : null;
    },
    () => null,
  );
  const autoState = useSyncExternalStore(
    store.subscribe,
    () => store.get().auto,
    () => null,
  );
  const running = offered && (activeRun !== null || autoState !== null);
  // The pill stays up while the device shows the other seat (hotseat: the defender answers), so Stop is always there.
  // While Log Pose plays the turn it stays up between plans too, so there is always a Stop.
  const pill = running ? <CopilotPill run={activeRun} auto={autoState} onStop={actions.stop} /> : null;

  if (!shown) return { shown: false, trigger: null, railTrigger: null, pill };

  const hidden = o.over;
  const label = "Log Pose";
  const trigger =
    o.layout === "landscape" ? null : (
      <button
        type="button"
        className={`hud-brief-btn hud-copilot-btn${o.layout === "desktop" ? " hud-brief-text" : " hud-icon-btn"}`}
        aria-label={label}
        title="Ask Log Pose about this game"
        data-busy={running ? "true" : undefined}
        style={hidden ? { visibility: "hidden" } : undefined}
        tabIndex={hidden ? -1 : undefined}
        aria-hidden={hidden ? true : undefined}
        onClick={() => openPanel()}
      >
        <CopilotGlyph />
        {o.layout === "desktop" ? <span className="hud-brief-label">Log Pose</span> : null}
        <span className="hud-brief-dot" aria-hidden="true" />
      </button>
    );
  const railTrigger =
    o.layout === "landscape" ? (
      <button type="button" className="lp-rail-btn" aria-label={label} title="Ask Log Pose about this game" data-busy={running ? "true" : undefined} onClick={() => openPanel()}>
        <CopilotGlyph size={20} />
      </button>
    ) : null;
  return { shown: true, trigger, railTrigger, pill };
}
