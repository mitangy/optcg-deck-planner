import { useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import type { ChoiceOptionView, ChoiceRequestView, Intent, PendingChoiceView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";

type Props = {
  choice: PendingChoiceView;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
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
function OptionTile({ option, mySeat, selected, disabled, onToggle, badge }: {
  option: ChoiceOptionView;
  mySeat: Seat;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  const owner = option.ownerSeat == null ? null : option.ownerSeat === mySeat ? "Yours" : "Opponent";
  const zone = option.zone ? ZONE_LABEL[option.zone] ?? option.zone : null;
  if (!option.defId || option.defId === "HIDDEN") {
    return (
      <button type="button" className={`ability-chip choice-chip${selected ? " selected" : ""}`} disabled={disabled} aria-pressed={selected} onClick={onToggle}>
        {optionName(option)}
      </button>
    );
  }
  return (
    <div className={`choice-option${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}>
      <CardTile
        defId={option.defId}
        compact
        rested={option.rested}
        selected={selected}
        inspectGestures
        onClick={disabled ? undefined : onToggle}
        ownerSeat={option.ownerSeat}
        viewingSeat={mySeat}
      />
      <span className="choice-option-caption">
        {badge ? <span className="choice-badge">{badge}</span> : null}
        {[owner, zone].filter(Boolean).join(" · ")}
        {disabled ? " · not eligible" : ""}
      </span>
    </div>
  );
}

function moveItem(list: string[], id: string, delta: -1 | 1): string[] {
  const index = list.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const out = [...list];
  [out[index], out[next]] = [out[next]!, out[index]!];
  return out;
}

/** Ordered list of cards with move buttons and optional top/bottom placement. */
function OrderList({ ids, byId, onMove, topIds, onToggleTop, topBottom, label }: {
  ids: string[];
  byId: Map<string, ChoiceOptionView>;
  onMove: (id: string, delta: -1 | 1) => void;
  topIds: Set<string>;
  onToggleTop: (id: string) => void;
  topBottom: boolean;
  label: string;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="ability-prompt-section">
      <div className="ability-prompt-label">{label}</div>
      <ol className="search-order-list">
        {ids.map((id, index) => {
          const option = byId.get(id)!;
          return (
            <li key={id}>
              <span className="choice-order-name">{optionName(option)}</span>
              <span className="search-order-actions">
                {topBottom ? (
                  <button type="button" className="choice-place" aria-pressed={topIds.has(id)} onClick={() => onToggleTop(id)}>
                    {topIds.has(id) ? "Top" : "Bottom"}
                  </button>
                ) : null}
                <button type="button" disabled={index === 0} onClick={() => onMove(id, -1)} aria-label={`Move ${optionName(option)} up`}>↑</button>
                <button type="button" disabled={index === ids.length - 1} onClick={() => onMove(id, 1)} aria-label={`Move ${optionName(option)} down`}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SourceHeader({ choice }: { choice: PendingChoiceView }) {
  const name = choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
  return <h3>{name}</h3>;
}

function SelectBody({ request, choice, mySeat, onSend }: { request: Extract<ChoiceRequestView, { type: "select" }>; choice: PendingChoiceView; mySeat: Seat; onSend: (i: Intent) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.max === 1 ? [id] : cur.length >= request.max ? cur : [...cur, id]));
  const valid = selected.length >= request.min && selected.length <= request.max;
  const range = request.min === request.max ? `${request.max}` : request.min === 0 ? `up to ${request.max}` : `${request.min}–${request.max}`;
  return (
    <>
      <div className="ability-prompt-section">
        <div className="ability-prompt-label">Choose {range} · selected {selected.length}</div>
        <div className="choice-grid">
          {request.options.map((option) => (
            <OptionTile key={option.id} option={option} mySeat={mySeat} selected={selected.includes(option.id)} disabled={!option.eligible} onToggle={() => toggle(option.id)} />
          ))}
        </div>
      </div>
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected })}>
          {selected.length === 0 ? "Choose none" : `Confirm (${selected.length})`}
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
  const [order, setOrder] = useState<string[]>(() => request.options.map((o) => o.id));
  const [topIds, setTopIds] = useState<Set<string>>(() => new Set());
  const remaining = order.filter((id) => !selected.includes(id));
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
            onToggle={() => toggle(option.id)}
          />
        ))}
      </div>
      {needsOrder ? (
        <OrderList
          ids={remaining}
          byId={byId}
          onMove={(id, delta) => setOrder((cur) => moveItem(cur, id, delta))}
          topIds={topIds}
          onToggleTop={(id) => setTopIds((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
          topBottom={request.rest === "top_or_bottom"}
          label={request.rest === "deck_top" ? "Order (first = top of deck)" : request.rest === "top_or_bottom" ? "Place each card (Top / Bottom); order top-down" : "Order for the bottom of the deck (first placed first)"}
        />
      ) : (
        <p className="choice-rest-note">{request.restLabel}</p>
      )}
      {selected.length ? <p className="choice-rest-note">{selected.map((id) => `${optionName(byId.get(id)!)} → ${groupLabel(id) ?? "take"}`).join(" · ")}</p> : null}
      <div className="ability-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected.length < request.minSelect}
          onClick={() => onSend({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected, orderedOptionIds: remaining, ...(request.rest === "top_or_bottom" ? { topOptionIds: remaining.filter((id) => topIds.has(id)) } : {}) })}
        >
          {request.maxSelect === 0 ? "Done" : selected.length ? "Confirm" : "Take none & finish"}
        </button>
      </div>
    </>
  );
}

function OrderBody({ request, onSend }: { request: Extract<ChoiceRequestView, { type: "order" }>; onSend: (i: Intent) => void }) {
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [order, setOrder] = useState<string[]>(() => request.options.map((o) => o.id));
  const [topIds, setTopIds] = useState<Set<string>>(() => new Set(request.options.map((o) => o.id)));
  return (
    <>
      <OrderList
        ids={order}
        byId={byId}
        onMove={(id, delta) => setOrder((cur) => moveItem(cur, id, delta))}
        topIds={topIds}
        onToggleTop={(id) => setTopIds((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        topBottom={Boolean(request.allowTopOrBottom)}
        label="Order (first = top)"
      />
      <div className="ability-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={() => onSend({ type: "resolve_pending_choice", accept: true, orderedOptionIds: order, ...(request.allowTopOrBottom ? { topOptionIds: order.filter((id) => topIds.has(id)) } : {}) })}>
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
export function ChoicePrompt({ choice, mySeat, onSend }: Props) {
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
