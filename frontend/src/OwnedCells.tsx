import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

/** Base copies plus every owned alt-art copy: what counts toward a deck. */
export function totalOwned(owned: number, altsOwned?: number): number {
  return owned + Math.max(0, altsOwned ?? 0);
}

/**
 * Whether the main Owned cell is a read-only total. True only when the alt-art
 * tiles are on screen AND editable, because then the base count is edited under
 * the Base tile instead.
 */
export function ownedCellIsTotal(showAltArts: boolean, altCount: number, altsEditable: boolean): boolean {
  return showAltArts && altCount > 0 && altsEditable;
}

/** "Still need 5 of 8", or "Have all 8" once nothing is left to get. */
export function stillNeededText(still: number, need: number): string {
  return still > 0 ? `Still need ${still} of ${need}` : `Have all ${need}`;
}

/** "+2 alt" beside the Owned stepper: copies owned as alt arts. */
export function AltsOwnedNote({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="alts-owned-note" title="Alt-art copies you own, on top of Owned">
      +{count} alt
    </span>
  );
}

/** Read-only owned total (base + alts). Counts are edited under each art. */
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

/** The Owned column/row content: read-only total under alt tiles, otherwise the stepper. */
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

/** Still-needed count with the deck need as a muted "of N" line. */
export function StillNeededCell({ still, need }: { still: number; need: number }) {
  return (
    <span className="still-need">
      <span className="still-need-num">{still}</span>
      <span className="still-need-of">of {need}</span>
    </span>
  );
}

/**
 * Owned stepper that saves the base count. `compact` matches the alt-art tiles'
 * stepper (caption + small buttons) for use under the Base tile.
 */
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
  /** Patches cached shopping / collection / deck data right away, and again on save or failure. */
  applyOptimistic: (cardId: string, qty: number) => void;
  compact?: boolean;
  /** Card name, for the compact stepper's labels. */
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
    // Don't clobber an in-progress edit or an optimistic value waiting on the server.
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
