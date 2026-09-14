import { useEffect, useMemo, useRef, useState } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat, TimerMessage } from "../net/protocol";
import { BattleLogPanel } from "./BattleLogPanel";
import type { BattleLogEntry } from "./battleLog";
import { CardTile } from "./CardTile";
import {
  canDragDon,
  canDragHandCard,
  canDropPlayOnField,
  findDropTargetAtPoint,
  giveDonTargetIdsForAll,
  playCardTrashTargetIds,
  resolveDropIntents,
  type DragPayload,
} from "./dragIntents";
import { AbilityPrompt } from "./AbilityPrompt";
import { OnPlayPrompt } from "./OnPlayPrompt";
import { EffectOrderPrompt } from "./EffectOrderPrompt";
import { IntentBar } from "./IntentBar";
import {
  attackTargetIdsForAttacker,
  findAttackIntent,
  hasBoardActions,
} from "./intentFilter";
import { SideField } from "./SideField";
import { lookupCard } from "../cards/atlas";
import { sortHandIndices } from "./handSort";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  timer?: TimerMessage | null;
  spectator?: boolean;
  battleLog?: BattleLogEntry[];
  /** Hotseat: compact pass-device control in the HUD (replaces the old top banner). */
  hotseatPass?: { otherSeat: Seat; onPass: () => void };
  leaveLabel?: string;
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

const EMPTY_IDS = new Set<string>();

function needsOnPlayPrompt(choice: NonNullable<PlayerView["pendingChoices"]>[number]) {
  return (
    choice.kind === "on_play" &&
    (choice.abilityId === "on_play_life_choice" ||
      choice.abilityId === "on_play_hand_to_deck")
  );
}

function needsStructuredAbilityPrompt(choice: NonNullable<PlayerView["pendingChoices"]>[number]) {
  return (
    choice.kind === "when_attacking" ||
    choice.kind === "leader_on_opp_attack" ||
    choice.abilityId === "newgate_battle_power" ||
    choice.abilityId === "teach_redirect" ||
    choice.abilityId === "rocks_reveal_draw"
  );
}

function formatCountdown(endsAt: number | null | undefined, now: number): string | null {
  if (endsAt == null) return null;
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function describeBattle(view: PlayerView): string {
  const b = view.battle as {
    attackerId: string;
    target: { kind: string; instanceId?: string };
  } | null;
  if (!b) return "";
  const find = (side: "you" | "opponent", id: string) => {
    const pile = view[side];
    if (pile.leader.id === id) return pile.leader;
    return pile.characters.find((c) => c.id === id) ?? null;
  };
  const atk =
    find("you", b.attackerId) ?? find("opponent", b.attackerId);
  let def = null as ReturnType<typeof find>;
  if (b.target.kind === "leader") {
    // Defender is the non-attacker seat's leader
    def =
      view.you.leader.id === b.attackerId
        ? view.opponent.leader
        : view.you.leader;
  } else {
    const tid = b.target.instanceId ?? "";
    def = find("you", tid) ?? find("opponent", tid);
  }
  const atkName = atk?.defId ? lookupCard(atk.defId).name : "Attacker";
  const defName = def?.defId ? lookupCard(def.defId).name : "Defender";
  const atkPow = atk?.power ?? "?";
  const defPow = def?.power ?? "?";
  return `Battle: ${atkName} (${atkPow}) → ${defName} (${defPow})`;
}


export function DuelBoard({
  view,
  seat,
  matchId,
  errorBanner,
  matchOver,
  timer = null,
  spectator = false,
  battleLog = [],
  hotseatPass,
  leaveLabel = "Leave",
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const [handSorted, setHandSorted] = useState(false);
  const [selectedDonIds, setSelectedDonIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const handRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!timer?.turnEndsAt && !timer?.matchEndsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer?.turnEndsAt, timer?.matchEndsAt]);

  // Trackpad / mouse wheel → horizontal hand scroll when the row overflows.
  useEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handCollapsed, view?.you.hand.length]);

  const over = matchOver != null || view?.winner != null;
  const mySeat = seat ?? view?.seat ?? null;
  const spectating = spectator || Boolean(view?.spectator);
  const mulliganPhase = view?.phase === "mulligan";
  const decidingMulligan =
    Boolean(view) && !spectating && mulliganPhase && !view!.you.mulliganDone && !over;
  const yourTurn =
    Boolean(view) &&
    !spectating &&
    !over &&
    (decidingMulligan || view!.activeSeat === mySeat);
  const intents = view?.legalIntents ?? [];
  const dndEnabled = yourTurn && !spectating && !over && !mulliganPhase;
  const costArea = view?.you.costArea ?? [];

  const draggableDonIds = useMemo(() => {
    if (!dndEnabled) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const t of costArea) {
      if (canDragDon(intents, t.id)) ids.add(t.id);
    }
    return ids;
  }, [dndEnabled, intents, costArea]);

  const giveDonHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "give_don") return EMPTY_IDS;
    // Intersection across every dragged donId so a drop always fully succeeds.
    return new Set(giveDonTargetIdsForAll(intents, dragPayload.donIds));
  }, [dragPayload, intents]);

  // Drop stale selections (don rested/used, turn ended, etc.) whenever the
  // legal set changes, so the highlight/selection UI never lies.
  useEffect(() => {
    setSelectedDonIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => draggableDonIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [draggableDonIds]);

  useEffect(() => {
    if (!dndEnabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedDonIds(new Set());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dndEnabled]);

  function toggleDonSelect(donId: string) {
    setSelectedDonIds((prev) => {
      const next = new Set(prev);
      if (next.has(donId)) next.delete(donId);
      else next.add(donId);
      return next;
    });
  }

  function clearDonSelection() {
    setSelectedDonIds(new Set());
  }

  const playFieldHighlight = Boolean(
    dragPayload?.type === "play_card" &&
      canDropPlayOnField(intents, dragPayload.handIndex),
  );

  const playTrashHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "play_card") return EMPTY_IDS;
    return new Set(playCardTrashTargetIds(intents, dragPayload.handIndex));
  }, [dragPayload, intents]);

  const actionableBoardIds = useMemo(() => {
    if (!view) return EMPTY_IDS;
    const ids = new Set<string>();
    const candidates = [view.you.leader.id, ...view.you.characters.map((c) => c.id)];
    for (const id of candidates) {
      if (hasBoardActions(intents, id)) ids.add(id);
    }
    return ids;
  }, [view, intents]);

  const handDisplayIndices = useMemo(() => {
    if (!view || spectating || !handSorted) return null;
    return sortHandIndices(view.you.hand, (defId) => lookupCard(defId).cost);
  }, [view, spectating, handSorted]);

  const attackTargetIds = useMemo(() => {
    if (!dndEnabled || !selectedBoardId || !view) return EMPTY_IDS;
    return new Set(
      attackTargetIdsForAttacker(intents, selectedBoardId, view.opponent.leader.id),
    );
  }, [dndEnabled, selectedBoardId, intents, view]);

  function commitDrop(payload: DragPayload, clientX: number, clientY: number) {
    const drop = findDropTargetAtPoint(clientX, clientY);
    // Sequential client-side intents (no batch protocol) — one give_don per
    // selected donId that has a legal intent to this target.
    const toSend = resolveDropIntents(payload, drop, intents);
    setDragPayload(null);
    if (toSend.length > 0) {
      setHandFilter(null);
      setSelectedBoardId(null);
      for (const intent of toSend) onSendIntent(intent);
      if (payload.type === "give_don") clearDonSelection();
    }
  }

  function selectHandCard(idx: number) {
    setSelectedBoardId(null);
    setHandFilter((prev) => (prev === idx ? null : idx));
  }

  function selectBoardCard(id: string) {
    setHandFilter(null);
    setSelectedBoardId((prev) => (prev === id ? null : id));
  }

  // Drop a stale selection when the selected card leaves your board (KO'd, trashed, etc.)
  // or the turn changes, so the intent bar never lingers on a dead selection.
  useEffect(() => {
    if (!selectedBoardId || !view) return;
    const stillOnBoard =
      view.you.leader.id === selectedBoardId ||
      view.you.characters.some((c) => c.id === selectedBoardId);
    if (!stillOnBoard) setSelectedBoardId(null);
  }, [selectedBoardId, view]);

  function selectAttackTarget(targetId: string) {
    if (!view || !selectedBoardId) return;
    const intent = findAttackIntent(intents, selectedBoardId, targetId, view.opponent.leader.id);
    if (intent) {
      setSelectedBoardId(null);
      onSendIntent(intent);
    }
  }

  if (!view) {
    return (
      <div className="board-root arena">
        <header className="hud-bar">
          <div className="hud-brand">OPTCG DUEL</div>
          <div className="hud-status">Waiting for opponent…</div>
          <div className="hud-actions">
            <span className="match-id" title={matchId ?? undefined}>
              Room {matchId ?? "—"}
            </span>
            <button type="button" className="leave-btn" onClick={onLeave}>
              {leaveLabel}
            </button>
          </div>
        </header>
        {errorBanner ? (
          <button type="button" className="error-banner" onClick={onClearError}>
            {errorBanner}
          </button>
        ) : null}
        <div className="loading arena-loading">
          Share the room id — match starts when both seats join.
        </div>
      </div>
    );
  }

  const you = view.you;
  const opp = view.opponent;
  const boardSeat: Seat = mySeat ?? view.seat;
  const oppSeat: Seat = boardSeat === 0 ? 1 : 0;
  const viewingSeat: Seat | undefined = spectating ? undefined : boardSeat;

  return (
    <div
      className={`board-root arena${yourTurn ? " your-turn" : ""}${
        dragPayload ? " is-dnd" : ""
      }`}
    >
      <header className="hud-bar">
        <div className="hud-brand">OPTCG DUEL</div>
        <div className={`hud-status${yourTurn ? " pulse" : ""}`}>
          <span className="hud-phase">{view.phase}</span>
          <span className="hud-sep">·</span>
          <span>Turn {view.turnNumber}</span>
          <span className="hud-sep">·</span>
          <span>{spectating ? "Spectating" : `Seat ${mySeat}`}</span>
          {mulliganPhase && decidingMulligan ? (
            <span className="hud-turn-chip">MULLIGAN</span>
          ) : yourTurn ? (
            <span className="hud-turn-chip">YOUR TURN</span>
          ) : null}
          {spectating ? <span className="hud-turn-chip">SPECTATOR</span> : null}
          {formatCountdown(timer?.turnEndsAt, now) ? (
            <span className="hud-turn-chip hud-timer" title="Turn clock">
              Turn {formatCountdown(timer?.turnEndsAt, now)}
            </span>
          ) : null}
          {formatCountdown(timer?.matchEndsAt, now) ? (
            <span className="hud-turn-chip hud-timer" title="Match clock">
              Match {formatCountdown(timer?.matchEndsAt, now)}
            </span>
          ) : null}
        </div>
        <div className="hud-actions">
          <span className="match-id" title={matchId ?? undefined}>
            Room {matchId ?? "—"}
          </span>
          {hotseatPass ? (
            <button
              type="button"
              className="hud-pass-btn"
              title={`Pass device to seat ${hotseatPass.otherSeat}`}
              onClick={hotseatPass.onPass}
            >
              Pass → {hotseatPass.otherSeat}
            </button>
          ) : null}
          <button type="button" className="leave-btn" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </header>

      {errorBanner ? (
        <button type="button" className="error-banner" onClick={onClearError}>
          {errorBanner}
        </button>
      ) : null}

      <BattleLogPanel
        entries={battleLog}
        collapsed={logCollapsed}
        onToggle={() => setLogCollapsed((v) => !v)}
      />

      {mulliganPhase && !spectating ? (
        <div className="mulligan-banner" role="status">
          {view.you.mulliganDone ? (
            <>
              <strong>Mulligan locked in.</strong> Waiting for the other seat
              {view.opponent.mulliganDone ? "" : " — pass the device if this is hotseat"}.
            </>
          ) : (
            <>
              <strong>Opening hand.</strong> Keep these 5 cards, or mulligan to
              shuffle them back and draw a new hand of 5. Life is dealt after both
              players decide.
            </>
          )}
        </div>
      ) : null}

      <div className="playmat">
        <div className="playmat-inner">
          <div className="opp-hand-hint" aria-label={`Opponent hand ${opp.handCount}`}>
            <span className="opp-hand-label">Opp hand</span>
            <div className="opp-hand-backs">
              {Array.from({ length: Math.min(opp.handCount, 8) }).map((_, i) => (
                <span key={i} className="card-back" />
              ))}
              {opp.handCount > 8 ? <span className="opp-hand-more">+{opp.handCount - 8}</span> : null}
            </div>
          </div>

          <SideField
            side="opp"
            compact
            ownerSeat={oppSeat}
            viewingSeat={viewingSeat}
            data={{
              leader: opp.leader,
              characters: opp.characters,
              stage: opp.stage,
              deckCount: opp.deckCount,
              trash: opp.trash,
              lifeCount: opp.lifeCount,
              donDeckCount: opp.donDeckCount,
              costAreaCount: opp.costAreaCount,
              activeDonCount: opp.activeDonCount,
            }}
            target={
              attackTargetIds.size > 0
                ? { targetableIds: attackTargetIds, onSelectTarget: selectAttackTarget }
                : undefined
            }
          />

          <div className="midline">
            {Boolean(view.battle || view.pendingChoices?.length) ? (
              <div className="prompt">
                {view.pendingChoices?.length
                  ? view.pendingChoices[0].prompt
                  : describeBattle(view)}
              </div>
            ) : (
              <div className="midline-ornament" aria-hidden>
                <span />
              </div>
            )}
          </div>

          <SideField
            side="you"
            ownerSeat={boardSeat}
            viewingSeat={viewingSeat}
            data={{
              leader: you.leader,
              characters: you.characters,
              stage: you.stage,
              deckCount: you.deckCount,
              trash: you.trash,
              lifeCount: you.lifeCount,
              donDeckCount: you.donDeckCount,
              costArea: you.costArea,
              activeDonCount: you.activeDonCount,
            }}
            select={
              spectating
                ? undefined
                : {
                    selectedId: selectedBoardId,
                    onSelect: selectBoardCard,
                    actionableIds: actionableBoardIds,
                  }
            }
            drag={
              dndEnabled
                ? {
                    draggableDonIds,
                    draggingDonIds:
                      dragPayload?.type === "give_don"
                        ? new Set(dragPayload.donIds)
                        : EMPTY_IDS,
                    selectedDonIds,
                    onDonDragStart: (donId) => {
                      // Dragging a selected chip carries the whole selection;
                      // dragging an unselected chip selects just that one.
                      const donIds =
                        selectedDonIds.size > 0 && selectedDonIds.has(donId)
                          ? Array.from(selectedDonIds)
                          : [donId];
                      setSelectedDonIds(new Set(donIds));
                      setDragPayload({ type: "give_don", donIds });
                    },
                    onDonDragEnd: (donId, x, y) => {
                      const donIds =
                        dragPayload?.type === "give_don" ? dragPayload.donIds : [donId];
                      commitDrop({ type: "give_don", donIds }, x, y);
                    },
                    onDonDragCancel: () => setDragPayload(null),
                    onDonToggleSelect: toggleDonSelect,
                    onClearDonSelection: clearDonSelection,
                    giveDonHighlightIds,
                    playTrashHighlightIds,
                    playFieldHighlight,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <div className={`hand-rail${handCollapsed ? " collapsed" : ""}`}>
        <div className="hand-rail-head">
          <span className="hand-rail-title">{spectating ? "Seat hand (hidden)" : "Hand"}</span>
          <span className="hand-rail-count">
            {spectating ? (you.handCount ?? 0) : you.hand.length}
          </span>
          {!spectating ? (
            <div className="hand-rail-actions">
              <button
                type="button"
                className={`hand-rail-btn${handSorted ? " active" : ""}`}
                aria-pressed={handSorted}
                onClick={() => setHandSorted((v) => !v)}
              >
                Sort
              </button>
              <button
                type="button"
                className="hand-rail-btn"
                onClick={() => {
                  setHandCollapsed((v) => {
                    const next = !v;
                    if (next) setHandFilter(null);
                    return next;
                  });
                }}
              >
                {handCollapsed ? "Show" : "Hide"}
              </button>
            </div>
          ) : null}
        </div>
        <div className="hand-row" ref={handRowRef}>
          <div className="hand-row-inner">
            {spectating
              ? Array.from({ length: Math.min(you.handCount ?? 0, 8) }).map((_, i) => (
                  <span key={i} className="card-back hand-back" />
                ))
              : (handDisplayIndices ?? you.hand.map((_, i) => i)).map((idx) => {
                  const c = you.hand[idx]!;
                  const playable = dndEnabled && canDragHandCard(intents, idx);
                  return (
                    <CardTile
                      key={c.id}
                      defId={c.defId}
                      playCost={c.playCost}
                      selected={handFilter === idx}
                      onClick={() => selectHandCard(idx)}
                      dragEnabled={playable}
                      dragPayload={{ type: "play_card", handIndex: idx }}
                      onDragStart={() =>
                        setDragPayload({ type: "play_card", handIndex: idx })
                      }
                      onDragEnd={(x, y) =>
                        commitDrop({ type: "play_card", handIndex: idx }, x, y)
                      }
                      onDragCancel={() => setDragPayload(null)}
                      ownerSeat={boardSeat}
                      viewingSeat={viewingSeat}
                    />
                  );
                })}
          </div>
        </div>
      </div>

      {!spectating &&
      view.pendingChoices?.[0]?.kind === "order_effects" &&
      view.pendingChoices[0].seat === mySeat ? (
        <EffectOrderPrompt
          key={view.pendingChoices[0].id}
          choice={view.pendingChoices[0]}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : !spectating &&
        view.pendingChoices?.[0] &&
        needsOnPlayPrompt(view.pendingChoices[0]) &&
        view.pendingChoices[0].seat === mySeat ? (
        <OnPlayPrompt
          view={view}
          choice={view.pendingChoices[0]}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : !spectating &&
        view.pendingChoices?.[0] &&
        needsStructuredAbilityPrompt(view.pendingChoices[0]) &&
        view.pendingChoices[0].seat === mySeat ? (
        <AbilityPrompt
          key={view.pendingChoices[0].id}
          view={view}
          choice={view.pendingChoices[0]}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : !spectating &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat !== mySeat ? (
        <div className="ability-prompt ability-prompt-waiting" role="status">
          <h3>Waiting for opponent</h3>
          <p>{view.pendingChoices[0].prompt}</p>
          <p className="meta">They are resolving a leader ability or effect choice.</p>
        </div>
      ) : null}

      {!spectating ? (
        <IntentBar
          intents={(() => {
            const front = view.pendingChoices?.[0];
            // AbilityPrompt / OnPlay / EffectOrder own Accept/Decline — never
            // surface bare resolve_pending_choice for structured attack-window
            // abilities (when_attacking / leader_on_opp_attack), even if the
            // hotseat seat briefly mismatches the choice owner.
            const structuredOwns =
              front &&
              (front.kind === "order_effects" ||
                needsStructuredAbilityPrompt(front) ||
                needsOnPlayPrompt(front));
            if (!structuredOwns) return view.legalIntents;
            return view.legalIntents.filter(
              (i) =>
                i.type !== "resolve_pending_choice" &&
                i.type !== "order_pending_effects",
            );
          })()}
          view={view}
          disabled={over}
          filterHandIndex={handFilter}
          selectedBoardId={selectedBoardId}
          onSend={(intent) => {
            setHandFilter(null);
            setSelectedBoardId(null);
            onSendIntent(intent);
          }}
        />
      ) : (
        <div className="intent-bar">
          <p className="intent-empty">Spectating — both hands hidden; intents disabled</p>
        </div>
      )}

      {over ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Match over</h2>
            <p>
              {`Winner: seat ${matchOver?.winner ?? view.winner}\nReason: ${
                matchOver?.reason ?? view.winReason ?? "—"
              }`}
            </p>
            <button type="button" className="leave-btn" onClick={onLeave}>
              Return home
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
