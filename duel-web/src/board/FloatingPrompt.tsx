import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { lookupCard } from "../cards/atlas";
import type { ChoiceRequestView, Intent, PendingChoiceView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { useClickCopy } from "./clickCopy";
import { floatLookAnswer, moveId, nearestSlot, tapInOrder } from "./floatOrder";
import "./float.css";
import { BackPill, promptSourceName } from "./HideablePrompt";
import { usePromptDrag } from "./promptDrag";
import { useDuelSettings } from "../settings";

/**
 * Floating-card prompts (always on in matches; `/demo?box` shows the pop-up fallback): instead of a pop-up panel,
 * the cards an effect is working with float over the board in a row. Tap a
 * card to pick it, drag cards left / right to reorder, then confirm. The row
 * always reads left → right: top of deck → bottom, or first effect → last.
 */

/** Pending choices this prototype can float; everything else keeps the pop-up. */
export function canFloat(choice: PendingChoiceView): boolean {
  if (choice.kind === "order_effects") return (choice.unorderedChoices?.length ?? 0) > 1;
  const request = choice.request;
  return request?.type === "look" && request.options.every((o) => o.defId && o.defId !== "HIDDEN" && o.zone !== "don");
}

const sourceName = promptSourceName;

const DRAG_START_PX = 14;

/**
 * Drag-to-reorder for a row of `[data-float-id]` cards. The dragged card
 * follows the pointer; the others slide into their new slots (FLIP), so the
 * row reorders live under the finger. Slots are read from layout offsets, not
 * screen rects, so mid-slide transforms never confuse the drop point.
 */
function useFloatReorder(order: readonly string[], onReorder: (next: string[]) => void) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const live = useRef({ order, onReorder });
  live.current = { order, onReorder };
  const press = useRef<{ id: string; x: number; y: number } | null>(null);
  const prevPos = useRef(new Map<string, { x: number; y: number }>());

  const cards = () => [...(rowRef.current?.querySelectorAll<HTMLElement>("[data-float-id]") ?? [])];

  // FLIP: slide every card (except the one under the pointer) from its old slot.
  useLayoutEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of cards()) {
      const id = el.dataset.floatId!;
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, pos);
      const prev = prevPos.current.get(id);
      if (reduce || !prev || id === dragId || (prev.x === pos.x && prev.y === pos.y)) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)`;
      void el.offsetWidth;
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "";
    }
    prevPos.current = next;
  }, [order, dragId]);

  useEffect(() => {
    const follow = (id: string, x: number, y: number) => {
      const row = rowRef.current;
      const el = cards().find((c) => c.dataset.floatId === id);
      if (!row || !el) return;
      const r = row.getBoundingClientRect();
      const cx = r.left + el.offsetLeft + el.offsetWidth / 2;
      const cy = r.top + el.offsetTop + el.offsetHeight / 2;
      el.style.transition = "none";
      el.style.transform = `translate(${x - cx}px, ${y - cy}px)`;
    };
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const row = rowRef.current;
      if (!row) return;
      if (!dragId) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return;
        setDragId(p.id);
      }
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const slots = cards().map((c) => ({ x: r.left + c.offsetLeft + c.offsetWidth / 2, y: r.top + c.offsetTop + c.offsetHeight / 2 }));
      const index = nearestSlot(slots, e.clientX, e.clientY);
      const { order: cur, onReorder: reorder } = live.current;
      if (cur.indexOf(p.id) !== index) reorder(moveId(cur, p.id, index));
      follow(p.id, e.clientX, e.clientY);
    };
    const onEnd = () => {
      const id = dragId;
      press.current = null;
      if (!id) return;
      // The pointerup's click lands on the card: don't treat the drop as a tap.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const el = cards().find((c) => c.dataset.floatId === id);
      if (el) {
        el.style.transition = "transform 160ms ease-out";
        el.style.transform = "";
      }
      setDragId(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragId]);

  const bind = (id: string) => ({
    "data-float-id": id,
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".float-nudge, .card-inspect-chip")) return;
      press.current = { id, x: e.clientX, y: e.clientY };
    },
    onClickCapture: (e: ReactMouseEvent) => {
      if (!suppressClick.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  return { rowRef, dragId, bind };
}

/** Shell shared by the floating prompts: header, the card row, and the action bar. */
function FloatShell({ choice, count, peek, onPeek, children, axis, note, actions }: {
  choice: PendingChoiceView;
  count: number;
  peek: boolean;
  onPeek: (peek: boolean) => void;
  children: ReactNode;
  axis: [string, string];
  note?: ReactNode;
  actions: ReactNode;
}) {
  const name = choice.kind === "order_effects" ? "Order effects" : sourceName(choice);
  // Effect ordering is a free-standing pop-up like the other choice prompts (#449): no scrim, the
  // board and the battle behind it stay clickable and visible, and its header drags it (promptPos).
  const free = choice.kind === "order_effects";
  const wrapRef = useRef<HTMLDivElement | null>(null);
  usePromptDrag(wrapRef, useDuelSettings().promptPos);
  const layer = peek ? (
    <BackPill label={`Back to ${name} · ${count} card${count === 1 ? "" : "s"}`} onShow={() => onPeek(false)} />
  ) : (
    <div className={`float-layer${free ? " float-layer-free" : ""}`} role="dialog" aria-label={choice.prompt} style={{ "--n": count } as CSSProperties}>
      {free ? null : <div className="float-scrim" aria-hidden />}
      <div className={`float-stage${free ? " float-stage-free" : ""}`}>
        <div className="float-head">
          <strong>{name}</strong>
          <span className="float-prompt">{choice.prompt}</span>
        </div>
        {children}
        <div className="float-axis" aria-hidden>
          <span>{axis[0]}</span>
          <span className="float-axis-line" />
          <span>{axis[1]}</span>
        </div>
        {note ? <div className="float-note">{note}</div> : null}
        <div className="float-actions">
          <button type="button" className="btn btn-secondary float-peek" onClick={() => onPeek(true)}>
            Hide
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
  return free ? (
    <div ref={wrapRef} className="prompt-hide-wrap">
      {layer}
    </div>
  ) : (
    layer
  );
}

/** Left / right step buttons for one card (keyboard and precise taps). */
function Nudge({ name, index, count, onMove }: { name: string; index: number; count: number; onMove: (to: number) => void }) {
  return (
    <span className="float-nudge">
      <button type="button" disabled={index === 0} aria-label={`Move ${name} left`} onClick={() => onMove(index - 1)}>◀</button>
      <span className="float-slot">{index + 1}</span>
      <button type="button" disabled={index === count - 1} aria-label={`Move ${name} right`} onClick={() => onMove(index + 1)}>▶</button>
    </span>
  );
}

/** Search / look at the top N cards: tap to take, drag to set the put-back order. */
function FloatLook({ choice, request, mySeat, onSend }: {
  choice: PendingChoiceView;
  request: Extract<ChoiceRequestView, { type: "look" }>;
  mySeat: Seat;
  onSend: (i: Intent) => void;
}) {
  const copy = useClickCopy();
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [row, setRow] = useState<string[]>(() => request.options.map((o) => o.id));
  const [picked, setPicked] = useState<string[]>([]);
  // "Top or bottom" moves the rest together: one switch for all of them.
  const [side, setSide] = useState<"top" | "bottom">("top");
  const [peek, setPeek] = useState(false);
  const { rowRef, dragId, bind } = useFloatReorder(row, setRow);

  const eligible = (id: string) => request.maxSelect > 0 && request.groups.some((g) => g.eligibleIds.includes(id));
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.maxSelect === 1 ? [id] : cur.length >= request.maxSelect ? cur : [...cur, id]));
  const remaining = row.filter((id) => !picked.includes(id));
  const needsOrder = request.rest === "deck_bottom" || request.rest === "deck_top" || request.rest === "top_or_bottom";
  const onTop = request.rest === "deck_top" || (request.rest === "top_or_bottom" && side === "top");
  const axis: [string, string] = !needsOrder
    ? ["", ""]
    : onTop
      ? ["Top of deck", "then the rest of your deck"]
      : ["Under the rest of your deck", "Very bottom"];
  const name = (id: string) => lookupCard(byId.get(id)!.defId!).name;

  return (
    <FloatShell
      choice={choice}
      count={row.length}
      peek={peek}
      onPeek={setPeek}
      axis={axis}
      note={
        <>
          {picked.length ? <span>Taking {picked.map(name).join(", ")}. </span> : request.maxSelect > 0 ? <span>{copy("Tap a highlighted card to take it.")} </span> : null}
          {needsOrder && remaining.length > 1 ? <span>Drag to reorder what goes back.</span> : !needsOrder ? <span>{request.restLabel}</span> : null}
        </>
      }
      actions={
        <>
          {request.rest === "top_or_bottom" && remaining.length ? (
            <span className="choice-place-seg float-side" role="group" aria-label="Top or bottom of deck">
              <button type="button" className="choice-place" aria-pressed={side === "top"} onClick={() => setSide("top")}>Top</button>
              <button type="button" className="choice-place" aria-pressed={side === "bottom"} onClick={() => setSide("bottom")}>Bottom</button>
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-primary float-confirm"
            data-confirm-key
            aria-keyshortcuts="Y Space"
            disabled={picked.length < request.minSelect}
            onClick={() => onSend({ type: "resolve_pending_choice", accept: true, ...floatLookAnswer(request, row, picked, side) })}
          >
            {request.maxSelect === 0 ? "Done" : picked.length ? `Confirm · take ${picked.length}` : "Take none & finish"}
          </button>
        </>
      }
    >
      <div ref={rowRef} className={`float-row${dragId ? " is-dragging" : ""}`}>
        {row.map((id) => {
          const option = byId.get(id)!;
          const isPicked = picked.includes(id);
          const canTake = eligible(id);
          const slot = remaining.indexOf(id);
          return (
            <div
              key={id}
              className={`float-card${isPicked ? " is-picked" : ""}${request.maxSelect > 0 && !canTake ? " is-ineligible" : ""}${canTake ? " is-eligible" : ""}${dragId === id ? " is-drag" : ""}`}
              {...bind(id)}
            >
              <div className="float-card-inner">
                <CardTile
                  defId={option.defId!}
                  selected={isPicked}
                  inspectGestures
                  instantClick
                  onClick={canTake ? () => toggle(id) : undefined}
                  ownerSeat={option.ownerSeat}
                  viewingSeat={mySeat}
                />
                {isPicked ? <span className="float-badge">Take</span> : null}
              </div>
              {needsOrder && !isPicked && remaining.length > 1 ? (
                <Nudge name={name(id)} index={slot} count={remaining.length} onMove={(to) => setRow(moveId(row, id, row.indexOf(remaining[to]!)))} />
              ) : (
                <span className="float-nudge float-nudge-empty" />
              )}
            </div>
          );
        })}
      </div>
    </FloatShell>
  );
}

/** Several effects at once: tap them in the order to resolve, or drag left → right. */
function FloatEffectOrder({ choice, mySeat, onSend }: { choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  const copy = useClickCopy();
  const effects = choice.unorderedChoices ?? [];
  const byId = useMemo(() => new Map(effects.map((c) => [c.id, c])), [effects]);
  const [order, setOrder] = useState<string[]>(() => effects.map((c) => c.id));
  const [tapped, setTapped] = useState<string[]>([]);
  const [peek, setPeek] = useState(false);
  const { rowRef, dragId, bind } = useFloatReorder(order, (next) => {
    setOrder(next);
    setTapped([]);
  });
  const tap = (id: string) => {
    const next = tapInOrder(order, tapped, id);
    setOrder(next.order);
    setTapped(next.tapped);
  };
  return (
    <FloatShell
      choice={{ ...choice, prompt: choice.prompt || "Choose the order these effects resolve in." }}
      count={order.length}
      peek={peek}
      onPeek={setPeek}
      axis={["Resolves first", "Resolves last"]}
      note={<span>{copy("Tap the cards in the order to resolve them, or drag them left to right.")}</span>}
      actions={
        <>
          {tapped.length ? (
            <button type="button" className="btn btn-secondary" onClick={() => setTapped([])}>
              Reset
            </button>
          ) : null}
          <button type="button" className="btn btn-primary float-confirm" data-confirm-key aria-keyshortcuts="Y Space" onClick={() => onSend({ type: "order_pending_effects", orderedIds: order })}>
            Resolve in this order
          </button>
        </>
      }
    >
      <div ref={rowRef} className={`float-row float-row-effects${dragId ? " is-dragging" : ""}`}>
        {order.map((id, index) => {
          const effect = byId.get(id)!;
          const number = tapped.indexOf(id);
          return (
            <div key={id} className={`float-card${number >= 0 ? " is-numbered" : ""}${dragId === id ? " is-drag" : ""}`} {...bind(id)}>
              <div className="float-card-inner">
                <CardTile defId={effect.cardDefId} inspectGestures instantClick onClick={() => tap(id)} ownerSeat={effect.seat} viewingSeat={mySeat} />
                <span className={`float-order-num${number >= 0 ? "" : " is-auto"}`}>{number >= 0 ? number + 1 : index + 1}</span>
              </div>
              <p className="float-effect-text">{effect.prompt}</p>
            </div>
          );
        })}
      </div>
    </FloatShell>
  );
}

/** Floating version of the choice prompt for the pending choices `canFloat` accepts. */
export function FloatingPrompt({ choice, mySeat, onSend }: { choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  if (choice.kind === "order_effects") return <FloatEffectOrder choice={choice} mySeat={mySeat} onSend={onSend} />;
  if (choice.request?.type === "look") return <FloatLook choice={choice} request={choice.request} mySeat={mySeat} onSend={onSend} />;
  return null;
}
