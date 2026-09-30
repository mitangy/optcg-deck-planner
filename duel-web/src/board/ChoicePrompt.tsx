import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { lookupCard } from "../cards/atlas";
import type { ChoiceOptionView, ChoiceRequestView, Intent, PendingChoiceView, PlayerView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { DON_CARD_ART } from "./donArt";
import { arrangementAnswer, arrangementRows, initialArrangement, mergeArrangement, moveToRow, nudge, setSide, withoutIds, type Arrangement } from "./deckOrder";
import { indexLiveCards, LiveCardsContext, readinessLabel, useLiveCard } from "./liveTargets";

type Props = {
  choice: PendingChoiceView;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
  /** Current board, so field targets show their live status (rested, sick, power…). */
  view?: PlayerView | null;
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
export function BoardHighlight({ ids, kind }: { ids: string[]; kind: "hover" | "candidate" }) {
  if (!ids.length) return null;
  const esc = (id: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, ""));
  const selector = ids.map((id) => `.side-field .card-tile[data-instance-id="${esc(id)}"]`).join(", ");
  const rule =
    kind === "hover"
      ? `${selector} { outline: 3px solid var(--chrome-bright); outline-offset: 2px; box-shadow: 0 0 18px rgba(240, 220, 168, 0.8); z-index: 4; }`
      : `${selector} { outline: 2px dashed rgba(240, 220, 168, 0.75); outline-offset: 2px; cursor: pointer; }`;
  return <style>{rule}</style>;
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
function useBoardTargetClicks(options: readonly ChoiceOptionView[], onPick: (optionId: string) => void) {
  const live = useRef({ options, onPick });
  live.current = { options, onPick };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
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

function SelectBody({ request, choice, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "select" }>; choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.max === 1 ? [id] : cur.length >= request.max ? cur : [...cur, id]));
  const valid = selected.length >= request.min && selected.length <= request.max;
  const range = request.min === request.max ? `${request.max}` : request.min === 0 ? `up to ${request.max}` : `${request.min}–${request.max}`;
  const boardIds = request.options.filter((o) => o.eligible && o.instanceId).map((o) => o.instanceId!);
  const selectedBoardIds = request.options.filter((o) => o.instanceId && selected.includes(o.id)).map((o) => o.instanceId!);
  useBoardTargetClicks(request.options, toggle);
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
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected })}>
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

function LookBody({ request, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "look" }>; mySeat: Seat; onSend: (i: Intent) => void }) {
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [selected, setSelected] = useState<string[]>([]);
  // Top by default, so "Done" without changes leaves the deck as it was.
  const [arrangement, setArrangement] = useState<Arrangement>(() => initialArrangement(request.options.map((o) => o.id)));
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
      {needsOrder ? (
        <OrderList
          arrangement={rest}
          byId={byId}
          // Selected cards keep their slot in the full arrangement.
          onChange={(next) => setArrangement(mergeArrangement(arrangement, next, selected))}
          mode={request.rest === "deck_top" ? "above" : request.rest === "top_or_bottom" ? "split" : "below"}
          pile="deck"
          label={request.rest === "deck_top" ? "Put back on top: drag to reorder" : request.rest === "top_or_bottom" ? "Put each card on top or bottom: drag to reorder" : "Put back on the bottom: drag to reorder"}
        />
      ) : (
        <p className="choice-rest-note">{request.restLabel}</p>
      )}
      {request.rest === "top_or_bottom" && remaining.length ? (
        <DeckPreview
          top={rest.top.map((id) => optionName(byId.get(id)!))}
          bottom={rest.bottom.map((id) => optionName(byId.get(id)!))}
        />
      ) : null}
      {selected.length ? <p className="choice-rest-note">{selected.map((id) => `${optionName(byId.get(id)!)} → ${groupLabel(id) ?? "take"}`).join(" · ")}</p> : null}
      <div className="ability-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected.length < request.minSelect}
          onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected, ...(request.rest === "top_or_bottom" ? arrangementAnswer(rest) : { orderedOptionIds: remaining }) })}
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
export function ChoicePrompt({ choice, mySeat, onSend, view }: Props) {
  const liveCards = useMemo(() => indexLiveCards(view), [view]);
  return (
    <LiveCardsContext.Provider value={liveCards}>
      <ChoicePromptBody choice={choice} mySeat={mySeat} onSend={onSend} />
    </LiveCardsContext.Provider>
  );
}

function ChoicePromptBody({ choice, mySeat, onSend }: Omit<Props, "view">) {
  const request: ChoiceRequestView = choice.request ?? { type: "confirm" };
  const showSource = request.type === "confirm" && choice.cardDefId && choice.cardDefId !== "HIDDEN";
  return (
    <div className={`ability-prompt choice-prompt choice-${request.type}`} role="dialog" aria-label={choice.prompt}>
      <SourceHeader choice={choice} />
      <div className="choice-intro">
        {showSource ? <CardTile defId={choice.cardDefId} compact inspectGestures viewingSeat={mySeat} /> : null}
        <p>{choice.prompt}</p>
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
