import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { nextWantTarget, wantAtDeckFloor } from "../shopping/shoppingExtras";
import { useRowHold, useSettledScope } from "../../ui/useSettledOrder";

export function totalOwned(owned: number, altsOwned?: number): number {
  return owned + Math.max(0, altsOwned ?? 0);
}

export function toBuyText(still: number, need: number): string {
  return still > 0 ? `To buy ${still} of ${need}` : `Have all ${need}`;
}

export function AltsOwnedNote({ count, total }: { count?: number; total?: number }) {
  if (!count || count <= 0) return null;
  const label = total != null ? `${total} owned in total: the stepper counts the base art, ${count} more ${count === 1 ? "is an alt" : "are alts"}` : "Alt-art copies you own, on top of Owned";
  return (
    <span className="alts-owned-note" title={label}>
      +{count} alt{total != null ? ` · ${total} total` : ""}
    </span>
  );
}

/** Read-only total in the Owned column when the art tiles hold the steppers: "1 base · 2 alts" under the total (#1380). */
export function OwnedTotalCell({ owned, altsOwned }: { owned: number; altsOwned?: number }) {
  const total = totalOwned(owned, altsOwned);
  const alts = Math.max(0, altsOwned ?? 0);
  return (
    <>
      <span className="owned-wrap">
        <span className="owned owned-total" role="img" aria-label={`${total} owned in total`}>
          {total}
        </span>
      </span>
      {alts > 0 && (
        <span className="alts-owned-note" title="Change these on the Base and alt art tiles">
          {owned} base · {alts} {alts === 1 ? "alt" : "alts"}
        </span>
      )}
    </>
  );
}

/**
 * The Owned column steps the base art and notes the alt copies. With `editedInTiles` (the art tiles show a Base stepper and
 * a stepper per alt) and at least one alt copy owned, it shows the total owned, read-only, with the base and alt counts
 * under it (#1380). While no alt copy is owned the total would equal the base count, so it stays the normal stepper.
 */
export function OwnedCell({
  owned,
  altsOwned,
  stepper,
  editedInTiles = false,
}: {
  owned: number;
  altsOwned?: number;
  stepper: ReactNode;
  editedInTiles?: boolean;
}) {
  if (editedInTiles && (altsOwned ?? 0) > 0) return <OwnedTotalCell owned={owned} altsOwned={altsOwned} />;
  return (
    <>
      {stepper}
      <AltsOwnedNote count={altsOwned} total={totalOwned(owned, altsOwned)} />
    </>
  );
}

/**
 * The To buy cell. While the row is held after you covered it (Only cards still needed is on), it
 * keeps its place and says "Have all N" with an Undo button instead of vanishing (#1498).
 */
export function StillNeededCell({ still, need, haveAll, rowId }: { still: number; need?: number; haveAll?: number; rowId?: string }) {
  const hold = useRowHold(rowId);
  if (hold?.done) {
    return (
      <span className="still-need still-need-done">
        <span className="still-need-have">
          <span className="still-need-check" aria-hidden="true">
            ✓
          </span>
          {haveAll ?? need ? `Have all ${haveAll ?? need}` : "Have all"}
        </span>
        <RowUndoButton hold={hold} />
      </span>
    );
  }
  return (
    <span className="still-need">
      <span className="still-need-num">{still}</span>
      {need != null && <span className="still-need-of">of {need}</span>}
    </span>
  );
}

/** Undo for a covered row held in place: a real button, so Tab reaches it, and it never selects the row behind it. */
export function RowUndoButton({ hold }: { hold: { canUndo: boolean; undo: () => void } }) {
  if (!hold.canUndo) return null;
  return (
    <button
      type="button"
      className="row-undo-btn"
      onClick={(e) => {
        e.stopPropagation();
        hold.undo();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      Undo
    </button>
  );
}

/** The same Undo in the grid and phone cards, where the status line is plain text. */
export function RowUndo({ rowId }: { rowId: string }) {
  const hold = useRowHold(rowId);
  return hold?.done ? <RowUndoButton hold={hold} /> : null;
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
  const settled = useSettledScope();
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
      settled?.clearHold(cardId);
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
    if (settled) {
      // Hold the row where it is, and remember the count it had so one Undo puts it back.
      const before = serverValueRef.current;
      settled.markEdited(cardId, {
        key: "owned",
        restore: async () => {
          applyOptimistic(cardId, before);
          try {
            const res = await api.setOwned(cardId, before);
            applyOptimistic(cardId, res.qty);
          } catch {
            /* the refresh below shows the real count */
          }
          onSaved();
        },
      });
    }
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
  explain,
}: {
  cardId: string;
  name: string;
  need: number;
  deckNeed: number;
  extraQty: number;
  applyOptimistic: (cardId: string, extraQty: number) => void;
  onSaved: () => void;
  /** Tooltip on the Need number: how the total comes from the decks. */
  explain?: string;
}) {
  const [err, setErr] = useState<string | null>(null);
  const prevRef = useRef(extraQty);
  prevRef.current = extraQty;
  const settled = useSettledScope();
  const save = useMutation({
    mutationFn: (target: number) => api.setShoppingExtra(cardId, target),
    onMutate: (target) => {
      const prev = prevRef.current;
      settled?.markEdited(cardId, {
        key: "want",
        restore: async () => {
          applyOptimistic(cardId, prev);
          try {
            await api.setShoppingExtra(cardId, prev);
          } catch {
            /* the refresh below shows the real count */
          }
          onSaved();
        },
      });
      applyOptimistic(cardId, target);
      return { prev };
    },
    onSuccess: () => {
      setErr(null);
      onSaved();
    },
    onError: (e: Error, _t, ctx) => {
      setErr(e.message);
      settled?.clearHold(cardId);
      applyOptimistic(cardId, ctx?.prev ?? 0);
    },
  });
  const atFloor = wantAtDeckFloor({ need, deckNeed });
  const over = extraQty > deckNeed && deckNeed > 0 ? extraQty - deckNeed : 0;
  let note: ReactNode = null;
  if (over > 0) {
    note = (
      <>
        +{over} over decks
        <button
          type="button"
          className="want-reset"
          aria-label={`Reset need for ${cardId} to decks`}
          disabled={save.isPending}
          onClick={() => save.mutate(0)}
        >
          Reset
        </button>
      </>
    );
  } else if (deckNeed === 0) {
    note = "added directly";
  }
  return (
    <span className="want-cell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="owned-wrap">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Need fewer of ${name}`}
          title={atFloor ? `Your decks need ${deckNeed}. Change the deck to go lower.` : undefined}
          disabled={save.isPending || atFloor}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => save.mutate(nextWantTarget({ need, deckNeed }, -1))}
        >
          −
        </button>
        <span className="want-qty" title={err ?? explain ?? (deckNeed > 0 ? "From your decks" : undefined)} aria-label={`${name} needed`}>
          {need}
        </span>
        <button
          type="button"
          className="owned-btn"
          aria-label={`Need more of ${name}`}
          disabled={save.isPending}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => save.mutate(nextWantTarget({ need, deckNeed }, 1))}
        >
          +
        </button>
        {err && <span className="owned-err">!</span>}
      </span>
      {note ? <span className="want-note">{note}</span> : null}
    </span>
  );
}
