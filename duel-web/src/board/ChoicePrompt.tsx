import { createContext, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { lookupCard } from "../cards/atlas";
import type { ChoiceOptionView, ChoiceRequestView, Intent, PendingChoiceView, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { DON_CARD_ART } from "./donArt";
import { arrangementAnswer, arrangementRows, groupAnswer, initialArrangement, mergeArrangement, moveToRow, nudge, setSide, withoutIds, type Arrangement } from "./deckOrder";
import { indexLiveCards, LiveCardsContext, readinessLabel, useLiveCard } from "./liveTargets";
import { promptSourceName, PromptHideButton } from "./HideablePrompt";
import { promptBody } from "./promptText";
import { boardPickSpots, pickCaption, resolvesOnPick, tapBoardSpot, toggleSelection, type BoardCardInfo, type BoardPick, type BoardSpot } from "./fieldTargets";
import { FieldTargetBar } from "./FieldTargetBar";
import { useDuelSettings } from "../settings";

/** True while the pop-up is tucked away (see `HideablePrompt`). */
const PromptHiddenContext = createContext(false);

type Props = {
  choice: PendingChoiceView;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
  /** Current board, so field targets show their live status (rested, sick, power…). */
  view?: PlayerView | null;
  /** Tucks the pop-up away so the hand and board can be read first. */
  onHide?: () => void;
  /** Tucked away: board clicks must not pick targets for a prompt you can't see. */
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

/** Card art tile (or labeled chip) for one choice option. */
export function OptionTile({ option, mySeat, selected, disabled, onToggle, badge, lookOnly = false }: {
  option: ChoiceOptionView;
  mySeat: Seat;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  badge?: string;
  /** Pure look (nothing can be taken): don't label cards "not eligible". */
  lookOnly?: boolean;
}) {
  const owner = option.ownerSeat == null ? null : option.ownerSeat === mySeat ? "Yours" : "Opponent";
  const zone = option.zone ? ZONE_LABEL[option.zone] ?? option.zone : null;
  // Field targets: read the card's live state off the board.
  const live = useLiveCard(option.instanceId);
  const [hovered, setHovered] = useState(false);
  if (option.zone === "don") {
    // DON!! are interchangeable cards: show where each one sits (active,
    // rested, or attached to which card) so the player picks the right one.
    return (
      <div className={`choice-option choice-don${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}>
        <button
          type="button"
          className={`choice-don-card${option.rested ? " rested" : ""}`}
          aria-pressed={selected}
          aria-label={option.label ?? "DON!!"}
          disabled={disabled}
          onClick={onToggle}
        >
          <img src={DON_CARD_ART} alt="" draggable={false} />
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
      <button type="button" className={`ability-chip choice-chip${selected ? " selected" : ""}`} disabled={disabled} aria-pressed={selected} onClick={onToggle}>
        {optionName(option)}
      </button>
    );
  }
  const readiness = live ? readinessLabel(live) : null;
  const where = live?.slot ? `${zone} ${live.slot}` : zone;
  return (
    <div
      className={`choice-option${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}
      // Hover / focus lights up this exact card on the board, so two copies
      // of the same card can be told apart.
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
        ownerSeat={option.ownerSeat}
        viewingSeat={mySeat}
      />
      <span className="choice-option-caption">
        {badge ? <span className="choice-badge">{badge}</span> : null}
        {[owner, where].filter(Boolean).join(" · ")}
        {disabled && !lookOnly ? " · not eligible" : ""}
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

/**
 * Outline board cards by instance id without touching the board's DOM: a
 * scoped style rule keyed on the tiles' `data-instance-id`.
 */
export function BoardHighlight({ ids, kind, hand = false }: { ids: string[]; kind: "hover" | "candidate"; hand?: boolean }) {
  const first = ids[0];
  const scrollsHand = hand && kind === "candidate";
  // A scrolling hand strip may have the choosable cards off-screen: bring the first into view.
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
  // Hand picks: a crowded hand hides a dashed line, so dim every card that can't be chosen.
  const dim = hand && kind === "candidate" ? ` ${HAND_ROWS} > .card-tile:not(${selector}) { opacity: 0.4; filter: saturate(0.5); }` : "";
  return <style>{rule + dim}</style>;
}

/**
 * Where the list sits against the rest of the pile: "above" (top of deck),
 * "below" (bottom of deck), or "split" (each card picks Top / Bottom).
 */
type OrderMode = "above" | "below" | "split";

/**
 * Cards to put back, drawn top → bottom like the pile itself, between "Top of
 * deck" and "Bottom of deck" caps with the untouched rest of the pile marked.
 * Reorder by dragging a row (the grip on touch screens) or with the arrows.
 */
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
  // Latest props for the window listeners of an in-flight drag.
  const live = useRef({ arrangement, onChange });
  live.current = { arrangement, onChange };

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      // Index among the other rows (the divider counts only when it is draggable-across).
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
                  // Explicit two-way switch: a single "Top"/"Bottom" toggle read
                  // like an action, not the card's current placement.
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

/** Where the cards will end up, read top of deck → bottom of deck. */
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

/** Option id for an eligible board card, by its tile's `data-instance-id`. */
export function boardTargetOption(options: readonly ChoiceOptionView[], instanceId: string | undefined): string | null {
  if (!instanceId) return null;
  return options.find((o) => o.eligible && o.instanceId === instanceId)?.id ?? null;
}

/**
 * Lets a click on a highlighted board card pick it, same as its tile in the
 * prompt. Listens on the document in the capture phase so the board's own
 * click (select card / show actions) never sees these clicks.
 */
export function useBoardTargetClicks(options: readonly ChoiceOptionView[], onPick: (optionId: string) => void) {
  const hidden = useContext(PromptHiddenContext);
  const live = useRef({ options, onPick, hidden });
  live.current = { options, onPick, hidden };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (live.current.hidden) return;
      const tile = (e.target as Element | null)?.closest?.<HTMLElement>(".side-field .card-tile[data-instance-id]");
      const optionId = boardTargetOption(live.current.options, tile?.dataset.instanceId);
      if (!optionId) return;
      e.preventDefault();
      e.stopPropagation();
      live.current.onPick(optionId);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** Selection state shared by the pop-up grid and the on-board bar. */
function useSelectPicks(request: Extract<ChoiceRequestView, { type: "select" }>, onSend: (i: Intent) => void) {
  const oneTap = useDuelSettings().oneTapActions;
  const [selected, setSelected] = useState<string[]>([]);
  const answer = (ids: string[]) => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  // One-tap: with exactly one pick wanted, picking it is the answer.
  const toggle = (id: string) => {
    if (resolvesOnPick(oneTap, request.min, request.max)) return answer([id]);
    setSelected((cur) => toggleSelection(cur, id, request.max));
  };
  const valid = selected.length >= request.min && selected.length <= request.max;
  const boardIds = request.options.filter((o) => o.eligible && o.instanceId).map((o) => o.instanceId!);
  const selectedBoardIds = request.options.filter((o) => o.instanceId && selected.includes(o.id)).map((o) => o.instanceId!);
  useBoardTargetClicks(request.options, toggle);
  return { selected, toggle, valid, boardIds, selectedBoardIds, answer };
}

function SelectBody({ request, choice, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "select" }>; choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  const { selected, toggle, valid, boardIds, selectedBoardIds, answer } = useSelectPicks(request, onSend);
  const range = request.min === request.max ? `${request.max}` : request.min === 0 ? `up to ${request.max}` : `${request.min}–${request.max}`;
  return (
    <>
      <BoardHighlight ids={boardIds} kind="candidate" />
      <BoardHighlight ids={selectedBoardIds} kind="hover" />
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">
          Choose {range} · selected {selected.length}
          {boardIds.length ? " · or pick it on the board" : ""}
        </div>
        <div className="choice-grid">
          {request.options.map((option) => (
            <OptionTile key={option.id} option={option} mySeat={mySeat} selected={selected.includes(option.id)} disabled={!option.eligible} onToggle={() => toggle(option.id)} />
          ))}
        </div>
      </div>
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => answer(selected)}>
          {selected.length === 0
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

/** Your hand's card tiles: only hand cards carry a motion id (the hand card's instance id). */
const HAND_TILE = ".card-tile[data-motion-id]";
const HAND_ROWS = ":is(.hand-fan-cards, .hand-row-inner, .hand-dock-cards, .rail-hand-cards)";

/** The board spot under a click: a field card tile, a hand card or a cost-area DON!! chip. */
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

/**
 * Taps on the board's targets (cards, DON!! chips) pick them. Capture phase,
 * so the board's own click (select card / show actions) never sees them.
 */
function useBoardSpotClicks(spots: ReadonlyMap<string, BoardSpot>, onTap: (spot: BoardSpot, chipId?: string) => void) {
  const hidden = useContext(PromptHiddenContext);
  const live = useRef({ spots, onTap, hidden });
  live.current = { spots, onTap, hidden };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (live.current.hidden) return;
      const hit = spotAtClick(e.target as Element | null, new Set(live.current.spots.values()));
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      live.current.onTap(hit.spot, hit.chipId);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** Outline cost-area DON!! chips: every chip of a pickable state, or the picked ones. */
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

/** Field card info the board-pick routing needs (owner, name, DON!! under it). */
function boardCards(live: ReadonlyMap<string, { seat: number; defId: string; attachedDonCount?: number }>): Map<string, BoardCardInfo> {
  const out = new Map<string, BoardCardInfo>();
  for (const [id, c] of live) out.set(id, { seat: c.seat, name: lookupCard(c.defId).name, attachedDonCount: c.attachedDonCount });
  return out;
}

/**
 * Every target is on the board (field cards, cost-area DON!!, DON!! under a
 * card): no pop-up, the player taps the board. Candidates are outlined, picks
 * highlighted; the bar only carries the words and the Confirm / Decline buttons.
 */
function FieldSelectBar({ request, choice, spots, onSend }: {
  request: Extract<ChoiceRequestView, { type: "select" }>;
  choice: PendingChoiceView;
  spots: Map<string, BoardSpot>;
  onSend: (i: Intent) => void;
}) {
  const oneTapSetting = useDuelSettings().oneTapActions;
  const [pick, setPick] = useState<BoardPick>({ selected: [], chips: {} });
  const answer = (ids: string[]) => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  const oneTap = resolvesOnPick(oneTapSetting, request.min, request.max);
  useBoardSpotClicks(spots, (spot, chipId) => {
    const next = tapBoardSpot(pick, spots, spot, request.max, chipId);
    // One-tap: with exactly one pick wanted, picking it is the answer.
    if (oneTap && next.selected.length === 1 && !pick.selected.includes(next.selected[0]!)) return answer(next.selected);
    setPick(next);
  });
  const { selected } = pick;
  const valid = selected.length >= request.min && selected.length <= request.max;
  const all = [...spots.values()];
  const picked = selected.map((id) => spots.get(id)).filter((s): s is BoardSpot => !!s);
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
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => answer(selected)}>
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
  // Top by default, so "Done" without changes leaves the deck as it was.
  const [arrangement, setArrangement] = useState<Arrangement>(() => initialArrangement(request.options.map((o) => o.id)));
  // "Top or bottom" moves the rest together, so one switch picks the side for all of them.
  const [side, setGroupSide] = useState<"top" | "bottom">("top");
  const rest = withoutIds(arrangement, selected);
  const remaining = [...rest.top, ...rest.bottom];
  const eligible = (id: string) => request.groups.some((g) => g.eligibleIds.includes(id));
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.maxSelect === 1 ? [id] : cur.length >= request.maxSelect ? cur : [...cur, id]));
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
          // Selected cards keep their slot in the full arrangement.
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
          disabled={selected.length < request.minSelect}
          onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected, ...(request.rest === "top_or_bottom" ? groupAnswer(remaining, side) : { orderedOptionIds: remaining }) })}
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
        <button type="button" className="btn btn-primary" onClick={() => onSend({ type: "resolve_pending_choice", accept: true, ...(request.allowTopOrBottom ? arrangementAnswer(arrangement) : { orderedOptionIds: arrangement.top }) })}>
          Confirm order
        </button>
      </div>
    </>
  );
}

/**
 * Generic prompt for every server choice request (protocol 5). The server
 * validates all answers; this component only helps build a legal one.
 */
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

function ChoicePromptBody({ choice, mySeat, onSend, onHide }: Omit<Props, "view" | "hidden">) {
  const request: ChoiceRequestView = choice.request ?? { type: "confirm" };
  const liveCards = useContext(LiveCardsContext);
  const cards = useMemo(() => boardCards(liveCards), [liveCards]);
  const spots = request.type === "select" ? boardPickSpots(request.options, cards, mySeat) : null;
  if (request.type === "select" && spots) {
    return <FieldSelectBar request={request} choice={choice} spots={spots} onSend={onSend} />;
  }
  const showSource = request.type === "confirm" && choice.cardDefId && choice.cardDefId !== "HIDDEN";
  return (
    <div className={`ability-prompt choice-prompt choice-${request.type}`} role="dialog" aria-label={choice.prompt}>
      <PromptHideButton onHide={onHide} />
      <SourceHeader choice={choice} />
      <div className="choice-intro">
        {showSource ? <CardTile defId={choice.cardDefId} compact inspectGestures viewingSeat={mySeat} /> : null}
        <p>{promptBody(promptSourceName(choice), choice.prompt)}</p>
      </div>
      {request.type === "confirm" ? (
        <div className="ability-prompt-actions">
          <button type="button" className="btn btn-primary" onClick={() => onSend({ type: "resolve_pending_choice", accept: true })}>
            {choice.kind === "life_trigger" ? "Activate Trigger" : "Yes"}
          </button>
          {choice.optional ? (
            <button type="button" className="btn btn-secondary" onClick={() => onSend({ type: "resolve_pending_choice", accept: false })}>
              {choice.kind === "life_trigger" ? "Add to hand" : "No"}
            </button>
          ) : null}
        </div>
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
