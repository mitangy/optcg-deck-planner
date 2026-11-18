import { PromptSlotPortal, SLOT_ROW } from "./PromptSlotPortal";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { lookupCard } from "../../cards/atlas";
import type { ChoiceOptionView, ChoiceRequestView, Intent, PendingChoiceView, PlayerView, Seat } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";
import { fallbackToDefaultDon, useDonArt } from "../don/donArt";
import { arrangementAnswer, arrangementRows, groupAnswer, initialArrangement, mergeArrangement, moveToRow, nudge, setSide, withoutIds, type Arrangement } from "../zones/deckOrder";
import { indexLiveCards, LiveCardsContext, readinessLabel, useLiveCard } from "../combat/liveTargets";
import { promptSourceName, PromptHideButton } from "./HideablePrompt";
import { promptBody } from "./promptText";
import { answersAtPick, boardPickSpots, createDoubleTap, doublePick, doubleTapBoardSpot, nameTakenIds, pickCaption, resolvesOnPick, tapBoardSpot, toggleSelection, type BoardCardInfo, type BoardPick, type BoardSpot } from "./fieldTargets";
import { FieldTargetBar } from "./FieldTargetBar";
import { useDuelSettings } from "../../settings";
import { useConfirmKeys } from "../input/useBoardHotkeys";
import { DOUBLE_CLICK_DELAY_MS } from "../preview/inspectGestures";

const PromptHiddenContext = createContext(false);

type Props = {
  choice: PendingChoiceView;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
  view?: PlayerView | null;
  onHide?: () => void;
  // Tucked away: board clicks must not pick targets for a prompt you can't see.
  hidden?: boolean;
};

const ZONE_LABEL: Record<string, string> = {
  leader: "Leader",
  character: "Field",
  stage: "Stage",
  hand: "Hand",
  trash: "Trash",
  deck: "Deck",
  life: "Life",
  resolving: "Resolving",
};

function optionName(option: ChoiceOptionView): string {
  if (option.label) return option.label;
  if (!option.defId || option.defId === "HIDDEN") return "Hidden card";
  return lookupCard(option.defId).name;
}

function cardName(option: ChoiceOptionView): string | null {
  return option.defId && option.defId !== "HIDDEN" ? lookupCard(option.defId).name : null;
}

export function OptionTile({ option, mySeat, selected, disabled, onToggle, onDouble, badge, lookOnly = false, disabledNote = "not eligible" }: {
  option: ChoiceOptionView;
  mySeat: Seat;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDouble?: () => void;
  badge?: string;
  lookOnly?: boolean;
  disabledNote?: string;
}) {
  const donArt = useDonArt();
  const owner = option.ownerSeat == null ? null : option.ownerSeat === mySeat ? "Yours" : "Opponent";
  const zone = option.zone ? ZONE_LABEL[option.zone] ?? option.zone : null;
  const live = useLiveCard(option.instanceId);
  const [hovered, setHovered] = useState(false);
  const doubleTap = useMemo(() => createDoubleTap(DOUBLE_CLICK_DELAY_MS), []);
  const onPlainClick = () => (onDouble && doubleTap.isDouble(option.id) ? onDouble() : onToggle());
  if (option.zone === "don") {
    // DON!! are interchangeable cards: show where each one sits so the player picks the right one.
    return (
      <div className={`choice-option choice-don${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}>
        <button
          type="button"
          className={`choice-don-card${option.rested ? " rested" : ""}`}
          aria-pressed={selected}
          aria-label={option.label ?? "DON!!"}
          disabled={disabled}
          onClick={onPlainClick}
        >
          <img src={donArt(option.ownerSeat)} alt="" draggable={false} onError={fallbackToDefaultDon} />
        </button>
        <span className="choice-option-caption">
          {badge ? <span className="choice-badge">{badge}</span> : null}
          {option.label ?? "DON!!"}
        </span>
      </div>
    );
  }
  if (!option.defId || option.defId === "HIDDEN") {
    return (
      <button type="button" className={`ability-chip choice-chip${selected ? " selected" : ""}`} disabled={disabled} aria-pressed={selected} onClick={onPlainClick}>
        {optionName(option)}
      </button>
    );
  }
  const readiness = live ? readinessLabel(live) : null;
  const where = live?.slot ? `${zone} ${live.slot}` : zone;
  return (
    <div
      className={`choice-option${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}
      onPointerEnter={live ? () => setHovered(true) : undefined}
      onPointerLeave={live ? () => setHovered(false) : undefined}
      onFocus={live ? () => setHovered(true) : undefined}
      onBlur={live ? () => setHovered(false) : undefined}
    >
      <CardTile
        defId={option.defId}
        compact
        rested={live?.rested ?? option.rested}
        power={live?.power}
        printedPower={live?.printedPower}
        fieldCost={live?.fieldCost}
        attachedDonCount={live?.attachedDonCount}
        statusLabels={live?.statusLabels}
        frame={live?.zone === "leader" ? "leader" : "default"}
        selected={selected}
        inspectGestures
        onClick={disabled ? undefined : onToggle}
        onDoubleActivate={disabled ? undefined : onDouble}
        ownerSeat={option.ownerSeat}
        viewingSeat={mySeat}
      />
      <span className="choice-option-caption">
        {badge ? <span className="choice-badge">{badge}</span> : null}
        {[owner, where].filter(Boolean).join(" · ")}
        {disabled && !lookOnly ? ` · ${disabledNote}` : ""}
      </span>
      {readiness ? (
        <span className={`choice-readiness choice-readiness-${readiness.toLowerCase().replace(/\s+/g, "-")}`}>
          {readiness}
        </span>
      ) : null}
      {hovered && option.instanceId ? <BoardHighlight ids={[option.instanceId]} kind="hover" /> : null}
    </div>
  );
}

export function BoardHighlight({ ids, kind, hand = false }: { ids: string[]; kind: "hover" | "candidate"; hand?: boolean }) {
  const first = ids[0];
  const scrollsHand = hand && kind === "candidate";
  useEffect(() => {
    if (!scrollsHand || !first) return;
    const el = document.querySelector<HTMLElement>(`${HAND_ROWS} > .card-tile[data-motion-id="${first.replace(/"/g, "")}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [scrollsHand, first]);
  if (!ids.length) return null;
  const esc = (id: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, ""));
  const selector = ids.map((id) => (hand ? `${HAND_TILE}[data-motion-id="${esc(id)}"]` : `.side-field .card-tile[data-instance-id="${esc(id)}"]`)).join(", ");
  const rule =
    kind === "hover"
      ? `${selector} { outline: 3px solid var(--chrome-bright); outline-offset: 2px; box-shadow: 0 0 18px rgba(240, 220, 168, 0.8); z-index: 4; }`
      : `${selector} { outline: 2px dashed rgba(240, 220, 168, 0.75); outline-offset: 2px; cursor: pointer; }`;
  // A crowded hand hides a dashed line, so dim every card that can't be chosen.
  const dim = hand && kind === "candidate" ? ` ${HAND_ROWS} > .card-tile:not(${selector}) { opacity: 0.4; filter: saturate(0.5); }` : "";
  return <style>{rule + dim}</style>;
}

type OrderMode = "above" | "below" | "split";

function OrderList({ arrangement, byId, onChange, mode, pile, label }: {
  arrangement: Arrangement;
  byId: Map<string, ChoiceOptionView>;
  onChange: (next: Arrangement) => void;
  mode: OrderMode;
  pile: "deck" | "Life";
  label: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const live = useRef({ arrangement, onChange });
  live.current = { arrangement, onChange };

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      // The divider counts only when it is draggable-across.
      const others = [...list.querySelectorAll<HTMLElement>("[data-order-row]")].filter((el) => el.dataset.orderRow !== dragId);
      const index = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < e.clientY;
      }).length;
      const { arrangement: cur, onChange: change } = live.current;
      const next = moveToRow(cur, dragId, index);
      if (next.top.join() !== cur.top.join() || next.bottom.join() !== cur.bottom.join()) change(next);
    };
    const onEnd = () => setDragId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragId]);

  const cardCount = arrangement.top.length + arrangement.bottom.length;
  if (cardCount === 0) return null;
  const split = mode === "split";
  const rows: (string | null)[] = split
    ? arrangementRows(arrangement)
    : mode === "below"
      ? [null, ...arrangement.top]
      : [...arrangement.top, null];
  const cardRows = split ? rows : arrangement.top;
  const onTop = new Set(arrangement.top);

  const startDrag = (e: ReactPointerEvent<HTMLLIElement>, id: string) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest("button")) return;
    // Touch drags start from the grip only, so the list still scrolls.
    if (e.pointerType !== "mouse" && !target.closest(".order-grip")) return;
    e.preventDefault();
    setDragId(id);
  };

  return (
    <div className="ability-prompt-section">
      <div className="ability-prompt-label">{label}</div>
      <div className="order-cap order-cap-top">▲ Top of {pile}</div>
      <ol ref={listRef} className={`search-order-list order-list${dragId ? " is-dragging" : ""}`}>
        {rows.map((id) => {
          if (id == null) {
            return (
              <li key="rest" className="order-rest" {...(split ? { "data-order-row": "rest" } : {})}>
                Rest of {pile}
              </li>
            );
          }
          const option = byId.get(id)!;
          const name = optionName(option);
          const index = cardRows.indexOf(id);
          return (
            <li
              key={id}
              data-order-row={id}
              className={`order-row${dragId === id ? " is-drag" : ""}`}
              onPointerDown={(e) => startDrag(e, id)}
            >
              <span className="order-grip" aria-hidden title="Drag to reorder">⠿</span>
              <span className="choice-order-name">{name}</span>
              <span className="search-order-actions">
                {split ? (
                  <span className="choice-place-seg" role="group" aria-label={`Place ${name}`}>
                    <button type="button" className="choice-place" aria-pressed={onTop.has(id)} onClick={() => onChange(setSide(arrangement, id, "top"))}>
                      Top
                    </button>
                    <button type="button" className="choice-place" aria-pressed={!onTop.has(id)} onClick={() => onChange(setSide(arrangement, id, "bottom"))}>
                      Bottom
                    </button>
                  </span>
                ) : null}
                <button type="button" disabled={index === 0} onClick={() => onChange(nudge(arrangement, id, -1))} aria-label={`Move ${name} up`}>↑</button>
                <button type="button" disabled={index === cardRows.length - 1} onClick={() => onChange(nudge(arrangement, id, 1))} aria-label={`Move ${name} down`}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="order-cap order-cap-bottom">▼ Bottom of {pile}</div>
    </div>
  );
}

function DeckPreview({ top, bottom }: { top: string[]; bottom: string[] }) {
  return (
    <p className="choice-rest-note deck-preview">
      {top.length ? (
        <>
          <strong>Top of deck:</strong> {top.join(", then ")}
          {bottom.length ? " · " : ""}
        </>
      ) : null}
      {bottom.length ? (
        <>
          <strong>Bottom of deck:</strong> {bottom.join(", then ")}
          {bottom.length > 1 ? " (last is the very bottom)" : ""}
        </>
      ) : null}
    </p>
  );
}

function SourceHeader({ choice }: { choice: PendingChoiceView }) {
  const name = choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
  return <h3>{name}</h3>;
}

export function boardTargetOption(options: readonly ChoiceOptionView[], instanceId: string | undefined): string | null {
  if (!instanceId) return null;
  return options.find((o) => o.eligible && o.instanceId === instanceId)?.id ?? null;
}

// Capture phase, so the board's own click never sees these clicks.
export function useBoardTargetClicks(
  options: readonly ChoiceOptionView[],
  onPick: (optionId: string) => void,
  // Also keeps `dblclick` from opening inspect.
  onDouble?: (optionId: string) => void,
) {
  const hidden = useContext(PromptHiddenContext);
  const live = useRef({ options, onPick, onDouble, hidden });
  live.current = { options, onPick, onDouble, hidden };
  useEffect(() => {
    const doubleTap = createDoubleTap(DOUBLE_CLICK_DELAY_MS);
    const targetAt = (e: MouseEvent) => {
      if (live.current.hidden) return null;
      const tile = (e.target as Element | null)?.closest?.<HTMLElement>(".side-field .card-tile[data-instance-id]");
      return boardTargetOption(live.current.options, tile?.dataset.instanceId);
    };
    const onClick = (e: MouseEvent) => {
      const optionId = targetAt(e);
      if (!optionId) return;
      e.preventDefault();
      e.stopPropagation();
      const { onPick: pick, onDouble: double } = live.current;
      if (double && doubleTap.isDouble(optionId)) double(optionId);
      else pick(optionId);
    };
    // The board tile's own double-click inspect must not open for a prompt target.
    const onDblClick = (e: MouseEvent) => {
      if (!live.current.onDouble || !targetAt(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, []);
}

function useSelectPicks(request: Extract<ChoiceRequestView, { type: "select" }>, onSend: (i: Intent) => void) {
  const oneTap = useDuelSettings().oneTapActions;
  const [selected, setSelected] = useState<string[]>([]);
  // Set once the answer is out: a double tap after a one-tap answer must not send a second one.
  const sent = useRef(false);
  const answer = (ids: string[]) => {
    sent.current = true;
    onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  };
  const taken = nameTakenIds(request.options, selected, request.distinctNames, cardName);
  const toggle = (id: string) => {
    if (taken.has(id)) return;
    const next = toggleSelection(selected, id, request.max);
    if (!selected.includes(id) && answersAtPick(oneTap, request.min, request.max, next.length)) return answer(next);
    setSelected(next);
  };
  const doubleToggle = (id: string) => {
    if (taken.has(id) || sent.current) return;
    const next = doublePick(selected, id, request.min, request.max);
    setSelected(next.selected);
    if (next.answer) answer(next.selected);
  };
  const valid = selected.length >= request.min && selected.length <= request.max;
  const boardIds = request.options.filter((o) => o.eligible && o.instanceId && !taken.has(o.id)).map((o) => o.instanceId!);
  const selectedBoardIds = request.options.filter((o) => o.instanceId && selected.includes(o.id)).map((o) => o.instanceId!);
  useBoardTargetClicks(request.options, toggle, doubleToggle);
  return { selected, taken, toggle, doubleToggle, valid, boardIds, selectedBoardIds, answer };
}

function SelectBody({ request, choice, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "select" }>; choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  const { selected, taken, toggle, doubleToggle, valid, boardIds, selectedBoardIds, answer } = useSelectPicks(request, onSend);
  const range = request.min === request.max ? `${request.max}` : request.min === 0 ? `up to ${request.max}` : `${request.min}–${request.max}`;
  // A hidden-zone pick with no candidate is still asked, so the opponent cannot tell it was empty.
  const none = request.options.length === 0;
  return (
    <>
      <BoardHighlight ids={boardIds} kind="candidate" />
      <BoardHighlight ids={selectedBoardIds} kind="hover" />
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">
          {none ? "No card to choose" : <>Choose {range} · selected {selected.length}</>}
          {boardIds.length ? " · or pick it on the board" : ""}
        </div>
        <div className="choice-grid">
          {request.options.map((option) => (
            <OptionTile
              key={option.id}
              option={option}
              mySeat={mySeat}
              selected={selected.includes(option.id)}
              disabled={!option.eligible || taken.has(option.id)}
              disabledNote={option.eligible ? "same name picked" : undefined}
              onToggle={() => toggle(option.id)}
              onDouble={() => doubleToggle(option.id)}
            />
          ))}
        </div>
      </div>
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" data-confirm-key aria-keyshortcuts="Y Space" disabled={!valid} onClick={() => answer(selected)}>
          {none
            ? "Continue"
            : selected.length === 0
            ? request.min > 0
              ? `Choose ${request.min}`
              : "Choose none"
            : `Confirm (${selected.length})`}
        </button>
        {choice.optional ? (
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button>
        ) : null}
      </div>
    </>
  );
}

const HAND_TILE = ".card-tile[data-motion-id]";
const HAND_ROWS = ":is(.hand-fan-cards, .hand-row-inner, .hand-dock-cards, .rail-hand-cards)";

function spotAtClick(target: Element | null, spots: ReadonlySet<BoardSpot>): { spot: BoardSpot; chipId?: string } | null {
  const handId = target?.closest?.<HTMLElement>(HAND_TILE)?.dataset.motionId;
  if (handId) return spots.has(`hand:${handId}`) ? { spot: `hand:${handId}` } : null;
  const tile = target?.closest?.<HTMLElement>(".side-field .card-tile[data-instance-id]");
  const id = tile?.dataset.instanceId;
  if (id) {
    if (spots.has(`card:${id}`)) return { spot: `card:${id}` };
    if (spots.has(`host:${id}`)) return { spot: `host:${id}` };
    return null;
  }
  const chip = target?.closest?.<HTMLElement>(".don-strip .don-chip-btn[data-don-id]");
  const side = chip?.closest(".don-strip-you") ? "you" : chip?.closest(".don-strip-opp") ? "opp" : null;
  if (!chip || !side) return null;
  const spot = `don:${side}:${chip.dataset.donRested === "true" ? "rested" : "active"}`;
  return spots.has(spot) ? { spot, chipId: chip.dataset.donId } : null;
}

// Capture phase, so the board's own click never sees them.
function useBoardSpotClicks(
  spots: ReadonlyMap<string, BoardSpot>,
  onTap: (spot: BoardSpot, chipId?: string) => void,
  onDouble: (spot: BoardSpot, chipId?: string) => void,
) {
  const hidden = useContext(PromptHiddenContext);
  const live = useRef({ spots, onTap, onDouble, hidden });
  live.current = { spots, onTap, onDouble, hidden };
  useEffect(() => {
    const doubleTap = createDoubleTap(DOUBLE_CLICK_DELAY_MS);
    const hitAt = (e: MouseEvent) => (live.current.hidden ? null : spotAtClick(e.target as Element | null, new Set(live.current.spots.values())));
    const onClick = (e: MouseEvent) => {
      const hit = hitAt(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      if (doubleTap.isDouble(`${hit.spot}|${hit.chipId ?? ""}`)) live.current.onDouble(hit.spot, hit.chipId);
      else live.current.onTap(hit.spot, hit.chipId);
    };
    // The board tile's own double-click inspect must not open for a prompt target.
    const onDblClick = (e: MouseEvent) => {
      if (!hitAt(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
    };
  }, []);
}

function DonHighlight({ spots, chipIds, kind }: { spots: BoardSpot[]; chipIds: string[]; kind: "hover" | "candidate" }) {
  const esc = (id: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, ""));
  const selectors = [
    ...spots.map((s) => {
      const [, side, state] = s.split(":");
      return `.don-strip-${side} .don-chip-btn[data-don-rested="${state === "rested"}"]`;
    }),
    ...chipIds.map((id) => `.don-strip .don-chip-btn[data-don-id="${esc(id)}"]`),
  ];
  if (!selectors.length) return null;
  const rule =
    kind === "hover"
      ? `${selectors.join(", ")} { z-index: 2; transform: translateY(-4px); } ${selectors.map((x) => `${x} .don-chip`).join(", ")} { outline: 3px solid var(--chrome-bright); outline-offset: 1px; box-shadow: 0 0 14px rgba(240, 220, 168, 0.8); }`
      : `${selectors.join(", ")} { cursor: pointer; } ${selectors.map((x) => `${x} .don-chip`).join(", ")} { outline: 2px dashed rgba(240, 220, 168, 0.75); outline-offset: 1px; }`;
  return <style>{rule}</style>;
}

function boardCards(live: ReadonlyMap<string, { seat: number; defId: string; attachedDonCount?: number }>): Map<string, BoardCardInfo> {
  const out = new Map<string, BoardCardInfo>();
  for (const [id, c] of live) out.set(id, { seat: c.seat, name: lookupCard(c.defId).name, attachedDonCount: c.attachedDonCount });
  return out;
}

function FieldSelectBar({ request, choice, spots, onSend }: {
  request: Extract<ChoiceRequestView, { type: "select" }>;
  choice: PendingChoiceView;
  spots: Map<string, BoardSpot>;
  onSend: (i: Intent) => void;
}) {
  const oneTapSetting = useDuelSettings().oneTapActions;
  const [pick, setPick] = useState<BoardPick>({ selected: [], chips: {} });
  // Set once the answer is out: a double tap after a one-tap answer must not send a second one.
  const sent = useRef(false);
  const answer = (ids: string[]) => {
    sent.current = true;
    onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  };
  const oneTap = resolvesOnPick(oneTapSetting, request.min, request.max);
  const taken = nameTakenIds(request.options, pick.selected, request.distinctNames, cardName);
  const open = taken.size ? new Map([...spots].filter(([id]) => !taken.has(id))) : spots;
  useBoardSpotClicks(
    open,
    (spot, chipId) => {
      const next = tapBoardSpot(pick, open, spot, request.max, chipId);
      const added = next.selected.some((id) => !pick.selected.includes(id));
      if (added && answersAtPick(oneTapSetting, request.min, request.max, next.selected.length)) return answer(next.selected);
      setPick(next);
    },
    (spot, chipId) => {
      if (sent.current) return;
      const next = doubleTapBoardSpot(pick, open, spot, request.min, request.max, chipId);
      setPick(next.pick);
      if (next.answer) answer(next.pick.selected);
    },
  );
  const { selected } = pick;
  const valid = selected.length >= request.min && selected.length <= request.max;
  const all = [...open.values()];
  const picked = selected.map((id) => open.get(id)).filter((s): s is BoardSpot => !!s);
  const cardIds = (list: BoardSpot[]) => [...new Set(list.filter((s) => s.startsWith("card:") || s.startsWith("host:")).map((s) => s.slice(s.indexOf(":") + 1)))];
  const handIds = (list: BoardSpot[]) => list.filter((s) => s.startsWith("hand:")).map((s) => s.slice("hand:".length));
  const donSpots = [...new Set(all.filter((s) => s.startsWith("don:")))];
  const pickedChips = selected.map((id) => pick.chips[id]).filter((c): c is string => !!c);
  return (
    <>
      <BoardHighlight ids={cardIds(all)} kind="candidate" />
      <BoardHighlight ids={cardIds(picked)} kind="hover" />
      <BoardHighlight ids={handIds(all)} kind="candidate" hand />
      <BoardHighlight ids={handIds(picked)} kind="hover" hand />
      <DonHighlight spots={donSpots} chipIds={[]} kind="candidate" />
      <DonHighlight spots={[]} chipIds={pickedChips} kind="hover" />
      <FieldTargetBar
        title={promptSourceName(choice)}
        text={promptBody(promptSourceName(choice), choice.prompt)}
        caption={pickCaption(request.min, request.max, selected.length)}
        label={choice.prompt}
        handPick={handIds(all).length > 0}
      >
        {oneTap ? null : (
          <button type="button" className="btn btn-primary" data-confirm-key aria-keyshortcuts="Y Space" disabled={!valid} onClick={() => answer(selected)}>
            {selected.length === 0 && request.min === 0 ? (handIds(all).length ? "None" : "Choose none") : "Confirm"}
          </button>
        )}
        {choice.optional ? (
          <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>Decline</button>
        ) : null}
      </FieldTargetBar>
    </>
  );
}

function LookBody({ request, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "look" }>; mySeat: Seat; onSend: (i: Intent) => void }) {
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [selected, setSelected] = useState<string[]>([]);
  const [arrangement, setArrangement] = useState<Arrangement>(() => initialArrangement(request.options.map((o) => o.id)));
  const [side, setGroupSide] = useState<"top" | "bottom">("top");
  const rest = withoutIds(arrangement, selected);
  const remaining = [...rest.top, ...rest.bottom];
  const eligible = (id: string) => request.groups.some((g) => g.eligibleIds.includes(id));
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.maxSelect === 1 ? [id] : cur.length >= request.maxSelect ? cur : [...cur, id]));
  const lookAnswer = (picked: string[]): Intent => {
    const rest = withoutIds(arrangement, picked);
    const left = [...rest.top, ...rest.bottom];
    return { type: "resolve_pending_choice", accept: true, selectedOptionIds: picked, ...(request.rest === "top_or_bottom" ? groupAnswer(left, side) : { orderedOptionIds: left }) };
  };
  const sent = useRef(false);
  const doubleToggle = (id: string) => {
    if (sent.current) return;
    const next = doublePick(selected, id, request.minSelect, request.maxSelect);
    setSelected(next.selected);
    if (next.answer) {
      sent.current = true;
      onSend(lookAnswer(next.selected));
    }
  };
  const needsOrder = request.rest === "deck_bottom" || request.rest === "deck_top" || request.rest === "top_or_bottom";
  const groupLabel = (id: string) => request.groups.find((g) => g.eligibleIds.includes(id))?.label;
  return (
    <>
      {request.maxSelect > 0 ? (
        <div className="ability-prompt-section">
          <div className="ability-prompt-label">
            {request.groups.map((g) => g.label).join(" · ")} · selected {selected.length}
          </div>
        </div>
      ) : null}
      <div className="choice-grid">
        {request.options.map((option) => (
          <OptionTile
            key={option.id}
            option={option}
            mySeat={mySeat}
            selected={selected.includes(option.id)}
            disabled={request.maxSelect === 0 || !eligible(option.id)}
            badge={selected.includes(option.id) ? "Take" : undefined}
            lookOnly={request.maxSelect === 0}
            onToggle={() => toggle(option.id)}
            onDouble={() => doubleToggle(option.id)}
          />
        ))}
      </div>
      {request.rest === "top_or_bottom" && remaining.length ? (
        <div className="ability-prompt-section choice-side-row">
          <span className="ability-prompt-label">Put {remaining.length > 1 ? "them all" : "it"} on</span>
          <span className="choice-place-seg" role="group" aria-label="Top or bottom of deck">
            <button type="button" className="choice-place" aria-pressed={side === "top"} onClick={() => setGroupSide("top")}>Top</button>
            <button type="button" className="choice-place" aria-pressed={side === "bottom"} onClick={() => setGroupSide("bottom")}>Bottom</button>
          </span>
        </div>
      ) : null}
      {needsOrder ? (
        <OrderList
          arrangement={rest}
          byId={byId}
          onChange={(next) => setArrangement(mergeArrangement(arrangement, next, selected))}
          mode={request.rest === "deck_top" || (request.rest === "top_or_bottom" && side === "top") ? "above" : "below"}
          pile="deck"
          label={request.rest === "deck_top" || (request.rest === "top_or_bottom" && side === "top") ? "Put back on top: drag to reorder" : "Put back on the bottom: drag to reorder"}
        />
      ) : (
        <p className="choice-rest-note">{request.restLabel}</p>
      )}
      {request.rest === "top_or_bottom" && remaining.length ? (
        <DeckPreview
          top={side === "top" ? remaining.map((id) => optionName(byId.get(id)!)) : []}
          bottom={side === "bottom" ? remaining.map((id) => optionName(byId.get(id)!)) : []}
        />
      ) : null}
      {selected.length ? <p className="choice-rest-note">{selected.map((id) => `${optionName(byId.get(id)!)} → ${groupLabel(id) ?? "take"}`).join(" · ")}</p> : null}
      <div className="ability-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-confirm-key
          aria-keyshortcuts="Y Space"
          disabled={selected.length < request.minSelect}
          onClick={() => onSend(lookAnswer(selected))}
        >
          {request.maxSelect === 0 ? "Done" : selected.length ? "Confirm" : "Take none & finish"}
        </button>
      </div>
    </>
  );
}

function OrderBody({ request, onSend }: { request: Extract<ChoiceRequestView, { type: "order" }>; onSend: (i: Intent) => void }) {
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [arrangement, setArrangement] = useState<Arrangement>(() => initialArrangement(request.options.map((o) => o.id)));
  const pile = request.destination === "life" ? "Life" : "deck";
  return (
    <>
      <OrderList
        arrangement={arrangement}
        byId={byId}
        onChange={setArrangement}
        mode={request.allowTopOrBottom ? "split" : "above"}
        pile={pile}
        label={request.allowTopOrBottom ? "Put each card on top or bottom: drag to reorder" : "Drag to reorder"}
      />
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" data-confirm-key aria-keyshortcuts="Y Space" onClick={() => onSend({ type: "resolve_pending_choice", accept: true, ...(request.allowTopOrBottom ? arrangementAnswer(arrangement) : { orderedOptionIds: arrangement.top }) })}>
          Confirm order
        </button>
      </div>
    </>
  );
}

export function ChoicePrompt({ choice, mySeat, onSend, view, onHide, hidden = false }: Props) {
  const liveCards = useMemo(() => indexLiveCards(view), [view]);
  return (
    <LiveCardsContext.Provider value={liveCards}>
      <PromptHiddenContext.Provider value={hidden}>
        <ChoicePromptBody choice={choice} mySeat={mySeat} onSend={onSend} onHide={onHide} />
      </PromptHiddenContext.Provider>
    </LiveCardsContext.Provider>
  );
}

// A Life card without [Trigger] has one answer (add it to hand), so Y, Space and N all decline; accept:true would be rejected by the engine.
export function confirmIntent(choice: Pick<PendingChoiceView, "kind" | "noTrigger" | "unpayable">, accept: boolean): Intent {
  // A cost the player cannot pay is still asked so the opponent learns nothing; the only legal answer is to decline.
  return { type: "resolve_pending_choice", accept: (choice.kind === "life_trigger" && choice.noTrigger) || choice.unpayable ? false : accept };
}

function ConfirmButtons({ choice, onSend, rowClass = "" }: { choice: PendingChoiceView; onSend: (i: Intent) => void; rowClass?: string }) {
  const noTrigger = choice.kind === "life_trigger" && choice.noTrigger === true;
  const cannotPay = choice.unpayable === true;
  if (noTrigger || cannotPay) {
    return (
      <div className={`ability-prompt-actions${rowClass}`}>
        <button type="button" className="btn btn-primary" aria-keyshortcuts="Y Space N" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>
          {noTrigger ? "No Trigger" : "Can't pay"}
        </button>
      </div>
    );
  }
  return (
    <div className={`ability-prompt-actions${rowClass}`}>
      <button type="button" className="btn btn-primary" aria-keyshortcuts="Y Space" onClick={() => onSend({ type: "resolve_pending_choice", accept: true })}>
        {choice.kind === "life_trigger" ? "Activate Trigger" : "Yes"}
      </button>
      {choice.optional ? (
        <button type="button" className="btn btn-secondary" aria-keyshortcuts="N" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>
          {choice.kind === "life_trigger" ? "Add to hand" : "No"}
        </button>
      ) : null}
    </div>
  );
}

function ChoicePromptBody({ choice, mySeat, onSend, onHide }: Omit<Props, "view" | "hidden">) {
  const request: ChoiceRequestView = choice.request ?? { type: "confirm" };
  const liveCards = useContext(LiveCardsContext);
  const cards = useMemo(() => boardCards(liveCards), [liveCards]);
  const spots = request.type === "select" ? boardPickSpots(request.options, cards, mySeat) : null;
  const hidden = useContext(PromptHiddenContext);
  useConfirmKeys(request.type === "confirm" && !hidden, choice.optional, (accept) => onSend(confirmIntent(choice, accept)));
  if (request.type === "select" && spots) {
    return <FieldSelectBar request={request} choice={choice} spots={spots} onSend={onSend} />;
  }
  const showSource = request.type === "confirm" && choice.cardDefId && choice.cardDefId !== "HIDDEN";
  if (choice.kind === "life_trigger" && request.type === "confirm" && showSource) {
    return (
      <div className="ability-prompt life-trigger-card choice-prompt choice-confirm" role="dialog" aria-label={choice.prompt}>
        <div className="life-trigger-tools" title="Drag to move, double-click to put back">
          <span className="life-trigger-grip" aria-hidden>
            ⠿
          </span>
          <PromptHideButton onHide={onHide} />
        </div>
        <CardTile defId={choice.cardDefId} inspectGestures viewingSeat={mySeat} />
        <PromptSlotPortal hidden={hidden}>
          <ConfirmButtons choice={choice} onSend={onSend} rowClass={` ${SLOT_ROW}`} />
        </PromptSlotPortal>
      </div>
    );
  }
  return (
    <div className={`ability-prompt choice-prompt choice-${request.type}`} role="dialog" aria-label={choice.prompt}>
      <PromptHideButton onHide={onHide} />
      <SourceHeader choice={choice} />
      <div className="choice-intro">
        {showSource ? <CardTile defId={choice.cardDefId} compact inspectGestures viewingSeat={mySeat} /> : null}
        <p>{promptBody(promptSourceName(choice), choice.prompt)}</p>
      </div>
      {request.type === "confirm" ? (
        <ConfirmButtons choice={choice} onSend={onSend} />
      ) : request.type === "mode" ? (
        <div className="ability-prompt-actions choice-modes">
          {request.options.map((option) => (
            <button key={option.id} type="button" className="btn btn-secondary choice-mode" onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] })}>
              {option.label}
            </button>
          ))}
        </div>
      ) : request.type === "select" ? (
        <SelectBody request={request} choice={choice} mySeat={mySeat} onSend={onSend} />
      ) : request.type === "look" ? (
        <LookBody request={request} mySeat={mySeat} onSend={onSend} />
      ) : (
        <OrderBody request={request} onSend={onSend} />
      )}
    </div>
  );
}
