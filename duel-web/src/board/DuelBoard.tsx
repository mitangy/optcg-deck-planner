import { useEffect, useMemo, useState } from "react";
import type { Intent, MatchOverMessage, PlayerView, Seat } from "../net/protocol";
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
import { IntentBar } from "./IntentBar";
import { SideField } from "./SideField";
import { lookupCard } from "../cards/atlas";

type Props = {
  view: PlayerView | null;
  seat: Seat | null;
  matchId: string | null;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  spectator?: boolean;
  battleLog?: BattleLogEntry[];
  onSendIntent: (intent: Intent) => void;
  onLeave: () => void;
  onClearError: () => void;
};

const EMPTY_IDS = new Set<string>();

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
  spectator = false,
  battleLog = [],
  onSendIntent,
  onLeave,
  onClearError,
}: Props) {
  const [handFilter, setHandFilter] = useState<number | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [selectedDonIds, setSelectedDonIds] = useState<Set<string>>(new Set());

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

  function commitDrop(payload: DragPayload, clientX: number, clientY: number) {
    const drop = findDropTargetAtPoint(clientX, clientY);
    // Sequential client-side intents (no batch protocol) — one give_don per
    // selected donId that has a legal intent to this target.
    const toSend = resolveDropIntents(payload, drop, intents);
    setDragPayload(null);
    if (toSend.length > 0) {
      setHandFilter(null);
      for (const intent of toSend) onSendIntent(intent);
      if (payload.type === "give_don") clearDonSelection();
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
              Leave
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
        </div>
        <div className="hud-actions">
          <span className="match-id" title={matchId ?? undefined}>
            Room {matchId ?? "—"}
          </span>
          <button type="button" className="leave-btn" onClick={onLeave}>
            Leave
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

      <div className="hand-rail">
        <div className="hand-rail-head">
          <span className="hand-rail-title">{spectating ? "Seat hand (hidden)" : "Hand"}</span>
          <span className="hand-rail-count">
            {spectating ? (you.handCount ?? 0) : you.hand.length}
          </span>
        </div>
        <div className="hand-row">
          {spectating
            ? Array.from({ length: Math.min(you.handCount ?? 0, 8) }).map((_, i) => (
                <span key={i} className="card-back hand-back" />
              ))
            : you.hand.map((c, idx) => {
                const playable = dndEnabled && canDragHandCard(intents, idx);
                return (
                  <CardTile
                    key={c.id}
                    defId={c.defId}
                    selected={handFilter === idx}
                    onClick={() => setHandFilter((prev) => (prev === idx ? null : idx))}
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

      {!spectating ? (
        <IntentBar
          intents={view.legalIntents}
          view={view}
          disabled={over}
          filterHandIndex={handFilter}
          onSend={(intent) => {
            setHandFilter(null);
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
