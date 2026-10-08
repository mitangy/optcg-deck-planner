import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLogPose, useLogPoseGame, type GameChatContext, type LogPoseGame, type TurnPlan } from "@optcg/analyst-client";
import { lookupCard } from "../cards/atlas";
import { setBoardCopilot } from "../logPose";
import type { BriefTicketWire, Intent, PlayerView, Seat } from "../net/protocol";
import { useDuelSettings } from "../settings";
import type { BattleLogEntry } from "./battleLog";
import { describeBattle } from "./battleBanner";
import {
  buildSnapshot,
  copilotAvailable,
  copilotShown,
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
};

function createStore() {
  let snap: CopilotSnap = { view: null, run: null, finished: {} };
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
      status = `Playing step ${mode.step + 1} of ${plan.steps.length}`;
      break;
    case "choice":
      status = "Your call: answer the prompt, then the plan continues";
      break;
    case "blocked":
      status = `Step ${mode.step + 1} can't be played: ${mode.reason}`;
      break;
    case "done":
      status = "Done. Every step was played.";
      break;
    case "stopped":
      status = `Stopped before step ${mode.step + 1}.${mode.reason ? ` ${mode.reason}` : ""}`;
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
        {mode.kind === "blocked" ? (
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
function PlanCardConnector({ plan, store, actions, ctx }: { plan: TurnPlan; store: Store; actions: Actions; ctx: { busy: boolean; ask: (text: string) => void } }) {
  const snap = useSyncExternalStore(store.subscribe, store.get, store.get);
  const own = snap.run?.plan.id === plan.id ? snap.run : (snap.finished[plan.id] ?? null);
  const mode = planCardMode(plan, own, snap.run, snap.view);
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

function CopilotPill({ run, onStop }: { run: PlanRun; onStop: () => void }) {
  const top = useBarBottom(true);
  const total = run.plan.steps.length;
  const step = Math.min(run.cursor.step + 1, total);
  const note = run.state === "choice" ? "your call" : run.state === "blocked" ? "needs you" : null;
  const style: CSSProperties = { top: top + 6 };
  const el = (
    <div className="logpose copilot-pill" data-state={run.state} style={style} role="status">
      <span className="copilot-pill-dot" aria-hidden="true" />
      <span className="copilot-pill-text">
        Log Pose · step {step} of {total}
        {note ? ` · ${note}` : ""}
      </span>
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
  const { enabled, openPanel } = useLogPose();
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
  const shown = copilotShown({ ...gate, viewSeat: view?.seat });

  const store = useMemo(createStore, []);
  const ticketRef = useRef<string | null>(null);
  ticketRef.current = brief?.ticket ?? null;
  const viewRef = useRef(view);
  viewRef.current = view;
  const logRef = useRef(o.battleLog);
  logRef.current = o.battleLog;
  const sendRef = useRef(o.onSendIntent);
  sendRef.current = o.onSendIntent;
  const ticketSeatRef = useRef(o.ticketSeat);
  ticketSeatRef.current = o.ticketSeat;

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
        if (!cur || playBlockReason(plan, cur, run) !== null) return;
        apply(startRun(plan), cur);
      },
      stop: () => {
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
  }, [store]);

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
        return { ticket, snapshot: buildSnapshot(v, battle, v.pendingChoices?.[0]), ...(log.length ? { log } : {}) };
      },
      renderPlan: (plan, ctx) => <PlanCardConnector key={plan.id} plan={plan} store={store} actions={actions} ctx={ctx} />,
    }),
    [store, actions],
  );
  useLogPoseGame(offered ? game : null);

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
    if (!runActive(run)) return;
    if (!offered) store.set({ run: stopRun(run, "Log Pose left the board.") });
    else if (over) store.set({ run: stopRun(run, "The game is over.") });
    // Hotseat: the device shows the other seat (the defender answering the attack). The plan waits for its seat.
    else if (view.seat !== ticketSeatRef.current) store.set({ run: stepRunOtherSeat(run, view) });
    else {
      const r = stepRun(run, view);
      store.set({ run: r.run });
      if (r.send) sendRef.current(r.send);
    }
  }, [view, offered, over, store]);

  // A refused move ends the plan: it was built on a board that is no longer the one on screen.
  const banner = o.errorBanner ?? null;
  useEffect(() => {
    if (!banner) return;
    const run = store.get().run;
    if (runActive(run)) store.set({ run: stopRun(run, `The game refused a move (${banner}).`) });
  }, [banner, store]);

  // Only the running plan matters here, so a fresh view alone never re-renders the board a second time.
  const activeRun = useSyncExternalStore(
    store.subscribe,
    () => {
      const run = store.get().run;
      return runActive(run) ? run : null;
    },
    () => null,
  );
  const running = offered && activeRun !== null;
  // The pill stays up while the device shows the other seat (hotseat: the defender answers), so Stop is always there.
  const pill = running && activeRun ? <CopilotPill run={activeRun} onStop={actions.stop} /> : null;

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
        onClick={openPanel}
      >
        <CopilotGlyph />
        {o.layout === "desktop" ? <span className="hud-brief-label">Log Pose</span> : null}
        <span className="hud-brief-dot" aria-hidden="true" />
      </button>
    );
  const railTrigger =
    o.layout === "landscape" ? (
      <button type="button" className="lp-rail-btn" aria-label={label} title="Ask Log Pose about this game" data-busy={running ? "true" : undefined} onClick={openPanel}>
        <CopilotGlyph size={20} />
      </button>
    ) : null;
  return { shown: true, trigger, railTrigger, pill };
}
