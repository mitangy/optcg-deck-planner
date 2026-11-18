import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { nextWantTarget, wantAtDeckFloor } from "../shopping/shoppingExtras";

export function totalOwned(owned: number, altsOwned?: number): number {
  return owned + Math.max(0, altsOwned ?? 0);
}

export function ownedCellIsTotal(showAltArts: boolean, altCount: number, altsEditable: boolean): boolean {
  return showAltArts && altCount > 0 && altsEditable;
}

export function stillNeededText(still: number, need: number): string {
  return still > 0 ? `Still need ${still} of ${need}` : `Have all ${need}`;
}

export function AltsOwnedNote({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="alts-owned-note" title="Alt-art copies you own, on top of Owned">
      +{count} alt
    </span>
  );
}

export function OwnedTotal({ owned, altsOwned }: { owned: number; altsOwned?: number }) {
  const alts = Math.max(0, altsOwned ?? 0);
  const total = totalOwned(owned, alts);
  return (
    <div
      className="owned-total"
      aria-label={`${total} owned in total; change counts under each art`}
      title={`${total} owned in total; change counts under each art`}
    >
      <span className="owned-total-num">{total}</span>
      {alts > 0 && <span className="owned-total-split">{owned} base + {alts} alt</span>}
    </div>
  );
}

export function OwnedCell({
  isTotal,
  owned,
  altsOwned,
  stepper,
}: {
  isTotal: boolean;
  owned: number;
  altsOwned?: number;
  stepper: ReactNode;
}) {
  if (isTotal) return <OwnedTotal owned={owned} altsOwned={altsOwned} />;
  return (
    <>
      {stepper}
      <AltsOwnedNote count={altsOwned} />
    </>
  );
}

export function StillNeededCell({ still, need }: { still: number; need?: number }) {
  return (
    <span className="still-need">
      <span className="still-need-num">{still}</span>
      {need != null && <span className="still-need-of">of {need}</span>}
    </span>
  );
}

export function OwnedStepper({
  cardId,
  value,
  onSaved,
  applyOptimistic,
  compact = false,
  name,
}: {
  cardId: string;
  value: number;
  onSaved: () => void;
  applyOptimistic: (cardId: string, qty: number) => void;
  compact?: boolean;
  name?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const serverValueRef = useRef(value);
  const pendingRef = useRef<number | null>(null);
  const draftNum = Number(draft);
  const displayQty = Number.isFinite(draftNum) ? Math.max(0, Math.floor(draftNum)) : 0;

  const mutation = useMutation({
    mutationFn: (n: number) => api.setOwned(cardId, n),
    onSuccess: (res) => {
      setErr(null);
      serverValueRef.current = res.qty;
      if (pendingRef.current === res.qty) pendingRef.current = null;
      applyOptimistic(cardId, res.qty);
      if (!focused) setDraft(String(res.qty));
      onSaved();
    },
    onError: (e: Error) => {
      setErr(e.message);
      pendingRef.current = null;
      applyOptimistic(cardId, serverValueRef.current);
      if (!focused) setDraft(String(serverValueRef.current));
    },
  });

  useEffect(() => {
    serverValueRef.current = value;
    if (focused || pendingRef.current !== null) return;
    setDraft(String(value));
  }, [value, cardId, focused]);

  function commit(next: number) {
    const n = Math.max(0, Math.floor(next));
    setDraft(String(n));
    if (n === serverValueRef.current && pendingRef.current === null) return;
    pendingRef.current = n;
    applyOptimistic(cardId, n);
    mutation.mutate(n);
  }

  function parseDraft(): number | null {
    const trimmed = draft.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  const decLabel = compact ? `Decrease owned for ${name ?? cardId} base art` : "Decrease owned";
  const incLabel = compact ? `Increase owned for ${name ?? cardId} base art` : "Increase owned";

  const dec = (
    <button
      type="button"
      className="owned-btn"
      aria-label={decLabel}
      disabled={mutation.isPending || displayQty <= 0}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => commit(displayQty - 1)}
    >
      −
    </button>
  );
  const inc = (
    <button
      type="button"
      className="owned-btn"
      aria-label={incLabel}
      disabled={mutation.isPending}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => commit(displayQty + 1)}
    >
      +
    </button>
  );

  if (compact) {
    return (
      <span className="alt-want-controls">
        <span className="alt-want-caption">Owned</span>
        <span className="owned-wrap alt-want-wrap">
          {dec}
          <span className="alt-want-qty" title={err ?? undefined} aria-label={`${name ?? cardId} base art owned`}>
            {displayQty}
          </span>
          {inc}
        </span>
        {err && <span className="owned-err">!</span>}
      </span>
    );
  }

  return (
    <span className="owned-wrap">
      {dec}
      <input
        className="owned"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        title={err ?? undefined}
        disabled={mutation.isPending && !focused}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || /^\d+$/.test(raw)) setDraft(raw);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseDraft();
          if (n == null) {
            setDraft(String(serverValueRef.current));
            return;
          }
          commit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(String(serverValueRef.current));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {inc}
      {err && <span className="owned-err">!</span>}
    </span>
  );
}

export function WantStepper({
  cardId,
  name,
  need,
  deckNeed,
  extraQty,
  applyOptimistic,
  onSaved,
}: {
  cardId: string;
  name: string;
  need: number;
  deckNeed: number;
  extraQty: number;
  applyOptimistic: (cardId: string, extraQty: number) => void;
  onSaved: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const prevRef = useRef(extraQty);
  prevRef.current = extraQty;
  const save = useMutation({
    mutationFn: (target: number) => api.setShoppingExtra(cardId, target),
    onMutate: (target) => {
      const prev = prevRef.current;
      applyOptimistic(cardId, target);
      return { prev };
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
    },
    onError: (e: Error, _t, ctx) => {
      setErr(e.message);
      applyOptimistic(cardId, ctx?.prev ?? 0);
    },
  });
  const atFloor = wantAtDeckFloor({ need, deckNeed });
  const over = extraQty > deckNeed && deckNeed > 0 ? extraQty - deckNeed : 0;
  let note: ReactNode;
  if (over > 0) {
    note = (
      <>
        +{over} over decks
        <button
          type="button"
          className="want-reset"
          aria-label={`Reset want for ${cardId} to decks`}
          disabled={save.isPending}
          onClick={() => save.mutate(0)}
        >
          Reset
        </button>
      </>
    );
  } else if (deckNeed > 0) {
    note = "from decks";
  } else {
    note = "added directly";
  }
  return (
    <span className="want-cell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="owned-wrap">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Want fewer of ${name}`}
          title={atFloor ? `Your decks need ${deckNeed}. Change the deck to go lower.` : undefined}
          disabled={save.isPending || atFloor}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => save.mutate(nextWantTarget({ need, deckNeed }, -1))}
        >
          −
        </button>
        <span className="want-qty" title={err ?? undefined} aria-label={`${name} wanted`}>
          {need}
        </span>
        <button
          type="button"
          className="owned-btn"
          aria-label={`Want more of ${name}`}
          disabled={save.isPending}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => save.mutate(nextWantTarget({ need, deckNeed }, 1))}
        >
          +
        </button>
        {err && <span className="owned-err">!</span>}
      </span>
      <span className="want-note">{note}</span>
    </span>
  );
}
