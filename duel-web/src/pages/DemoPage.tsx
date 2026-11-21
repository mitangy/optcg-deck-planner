import { useEffect, useMemo, useState } from "react";
import { PROTOCOL_VERSION, type DiceResult, type DiceStateMessage, type PlayerView, type RematchState, type Seat } from "../net/protocol";
import { createMatchStore } from "../state/matchStore";
import { useMatchStore } from "../state/useMatch";
import { DuelBoard } from "../board/DuelBoard";
import {
  DEMO_BATTLE_LOG,
  DEMO_CHAT,
  DEMO_INSTANCES,
  DEMO_OPP_SKIN,
  DEMO_REMATCH_DECKS,
  demoUndoState,
  loadDemoRecord,
  withBlockStep,
  withGameOverReveal,
  withHakiResolving,
  withHandReveals,
} from "../board/fixtures/demoViews";
import { DEMO_MATCH_ID } from "../board/audio/tabMute";
import { motionDemoSteps } from "./motionDemo";
import { buildDemoView, demoDiceNext, demoDiceStart, demoPickedBy } from "./demo/demoParams";

function demoRematch(params: URLSearchParams): RematchState {
  const mode = params.get("rematch");
  return {
    available: mode !== "left",
    requested: mode === "ask" ? [false, true] : mode === "wait" ? [true, false] : mode === "choose" ? [true, true] : [false, false],
    newDeck: [false, params.has("oppdeck")],
    declinedBy: null,
    chooser: mode === "choose" ? 0 : null,
  };
}

export function DemoPage() {
  const params = new URLSearchParams(window.location.search);
  const [dice, setDice] = useState<DiceStateMessage | null>(() => demoDiceStart(params));
  const [diceResult, setDiceResult] = useState<{ result: DiceResult; firstSeat: Seat } | null>(null);
  const view = buildDemoView(
    diceResult ? new URLSearchParams([...params, ["turn0", ""], ["first", String(diceResult.firstSeat)]]) : params,
  );
  const [haki, setHaki] = useState<"hand" | "asking" | "done">("hand");
  const [blockPassed, setBlockPassed] = useState(false);
  const live: PlayerView =
    haki !== "hand"
      ? withHakiResolving(view, haki === "asking")
      : params.get("counter") === "block" && !blockPassed
        ? withBlockStep(view)
        : view;
  const shown: PlayerView = params.has("over")
    ? withGameOverReveal(live)
    : params.has("reveal")
      ? withHandReveals(live)
      : live;
  const motionSteps = useMemo(() => (params.has("motion") ? motionDemoSteps(view) : null), []);
  const [motionStep, setMotionStep] = useState(0);
  const [motionRun, setMotionRun] = useState(0);
  const nextMotion = motionSteps?.[motionStep + 1];
  const [store] = useState(() =>
    createMatchStore("demo", {
      seat: 0,
      battleLog: DEMO_BATTLE_LOG,
      chat: DEMO_CHAT,
      instances: DEMO_INSTANCES,
      undo: params.has("undo") ? demoUndoState(params.get("undo")) : null,
      rematch: demoRematch(params),
    }),
  );
  const undo = useMatchStore(store, (m) => m.undo);
  const chat = useMatchStore(store, (m) => m.chat);
  const log = useMatchStore(store, (m) => m.battleLog);
  const rematch = useMatchStore(store, (m) => m.rematch)!;
  useEffect(() => {
    if (!params.has("reveal")) return;
    const t = window.setTimeout(() => {
      const events = [{ type: "card_revealed", seat: 1, defId: "ST01-009" }];
      if (params.get("reveal") === "2") events.push({ type: "card_revealed", seat: 1, defId: "ST01-006" });
      store.dispatch({ type: "events", events, turn: 3 });
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const events = motionSteps?.[motionStep]?.events;
    if (!events) return;
    store.dispatch({ type: "events", events, turn: 3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionStep, motionRun]);
  const [demoClockEnds] = useState(() => Date.now() + 612_000);
  return (
    <div className="duel-root">
      {motionSteps ? (
        <button
          type="button"
          className="motion-demo-btn"
          onClick={() => {
            if (nextMotion) setMotionStep((s) => s + 1);
            else {
              setMotionStep(0);
              setMotionRun((r) => r + 1);
            }
          }}
        >
          {nextMotion ? `Next: ${nextMotion.label}` : "Replay"}
        </button>
      ) : null}
      <DuelBoard
        key={motionRun}
        view={params.has("waiting") || dice ? null : (motionSteps?.[motionStep]?.view ?? shown)}
        seat={0}
        matchId={DEMO_MATCH_ID}
        spectator={params.has("spectate")}
        serverRestart={params.has("restart") ? { seconds: 10 } : null}
        seatSkins={params.has("oppart") ? [params.has("spectate") ? DEMO_OPP_SKIN : null, DEMO_OPP_SKIN] : undefined}
        players={params.has("oppart") ? [{ name: "Luffy" }, { name: "Zoro" }] : null}
        firstSeatPickedBy={diceResult ? diceResult.result.winner : demoPickedBy(params.get("pickedby"))}
        firstSeatDice={diceResult?.result ?? null}
        dicePhase={
          dice
            ? {
                state: dice,
                onAction: (action) => {
                  const next = demoDiceNext(dice, action, params);
                  if ("state" in next) {
                    setDice(next.state);
                    return;
                  }
                  setDice(null);
                  setDiceResult({ result: next.done, firstSeat: next.firstSeat });
                },
              }
            : undefined
        }
        waiting={dice ? { status: "Rolling for turn order…", invite: null } : undefined}
        errorBanner={null}
        onBackToTournament={params.has("tourney") ? () => undefined : undefined}
        matchOver={params.has("over") ? { winner: 1, reason: "leader_battle_at_zero_life" } : null}
        loadMatchRecord={params.has("over") && !params.has("guest") ? loadDemoRecord : undefined}
        rematch={
          params.has("over")
            ? {
                state: rematch,
                deckOptions: DEMO_REMATCH_DECKS,
                onAction: (action) => {
                  const r = store.getSnapshot().rematch ?? rematch;
                  store.dispatch({
                    type: "rematchState",
                    state:
                      action === "request"
                        ? { ...r, requested: [true, true], chooser: 0 }
                        : action === "decline"
                          ? { ...r, requested: [false, false], chooser: null }
                          : r,
                  });
                },
              }
            : undefined
        }
        battleLog={log}
        leaveLabel="Leave match"
        floatingPrompts={!params.has("box")}
        hotseatPass={
          params.has("practice") ? { otherSeat: 1, onPass: () => undefined } : undefined
        }
        chat={
          params.has("chat")
            ? {
                lines: chat,
                onSend: (text) =>
                  store.dispatch({
                    type: "chat",
                    lines: [{ id: `demo-chat-${store.getSnapshot().chat.length + 1}`, seat: 0, text, at: Date.now() }],
                  }),
              }
            : undefined
        }
        onConcede={
          params.has("practice")
            ? undefined
            : () => {
                const w = window as { __demoConcedes?: number };
                w.__demoConcedes = (w.__demoConcedes ?? 0) + 1;
              }
        }
        timer={
          params.has("clock")
            ? {
                protocolVersion: PROTOCOL_VERSION,
                turnSeconds: null,
                matchSeconds: null,
                turnEndsAt: null,
                matchEndsAt: null,
                activeSeat: 0,
                seatSeconds: 900,
                seatRemainingMs: [612_000, 48_000],
                clockSeat: 0,
                clockEndsAt: demoClockEnds,
              }
            : null
        }
        opponentAwayUntil={params.has("away") ? demoClockEnds : null}
        undo={
          undo
            ? {
                state: undo,
                defaultOpen: ["menu", "blocked", "limit", "nothing", "full"].includes(params.get("undo") ?? ""),
                onAction: (action, opts) => {
                  const u = store.getSnapshot().undo;
                  if (!u) return;
                  store.dispatch({
                    type: "undoState",
                    state: {
                      ...u,
                      pending:
                        action === "request"
                          ? {
                              from: 0,
                              toTurn: u.targetTurn ?? 1,
                              action: u.action,
                              scope: opts?.scope ?? "action",
                              steps: opts?.scope === "turn" ? (u.options?.turn.steps ?? 1) : 1,
                              force: opts?.force === true,
                              revealReason: opts?.force ? "a deck or Life card was looked at" : null,
                            }
                          : null,
                    },
                  });
                },
              }
            : undefined
        }
        onSendIntent={(intent) => {
          const w = window as { __demoIntents?: unknown[] };
          (w.__demoIntents ??= []).push(intent);
          if (params.get("counter") === "block" && intent.type === "pass_block") {
            setBlockPassed(true);
          }
          if (params.get("counter") === "haki") {
            if (intent.type === "counter_event") setHaki("asking");
            if (intent.type === "resolve_pending_choice") setHaki("done");
          }
        }}
        onLeave={() => {
          window.location.href = "/";
        }}
        onClearError={() => undefined}
      />
    </div>
  );
}
