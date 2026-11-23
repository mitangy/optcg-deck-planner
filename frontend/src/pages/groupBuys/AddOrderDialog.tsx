import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, type GroupBuyDetail, type GroupBuyLine, type GroupBuyOrderPreview } from "../../api";
import { qk } from "../../cache/queryKeys";
import { useGroupBuyListNarrow } from "../../hooks/useGroupBuyListNarrow";
import { CardThumb } from "../../ui/CardThumb";
import { artLabel, pickableLines, pickedOrderLines } from "./groupBuyOrders";
import { lineArtUrl } from "./useGroupBuyLines";

const PREVIEW_DELAY_MS = 450;

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function whoText(allocations: { display_name: string; qty: number }[], extra: number): string {
  const parts = allocations.map((a) => `${a.display_name} ×${a.qty}`);
  if (extra > 0) parts.push(`${extra} extra`);
  return parts.join(", ") || "Nobody needs it";
}

function PreviewResult({ preview, lines, narrow }: { preview: GroupBuyOrderPreview; lines: GroupBuyLine[]; narrow: boolean }) {
  const byCard = new Map(lines.map((l) => [l.card_id, l]));
  const copies = preview.lines.reduce((s, l) => s + l.qty, 0);
  const unmatchedCopies = preview.unmatched.reduce((s, u) => s + u.qty, 0);
  return (
    <div className="gb-preview" data-testid="gb-order-preview">
      <h3 className="gb-preview-title">Matched to this group buy</h3>
      <p className="muted gb-preview-sum">
        {preview.lines.length} {preview.lines.length === 1 ? "card" : "cards"} · {copies} {copies === 1 ? "copy" : "copies"} matched
        {preview.unmatched.length ? ` · ${unmatchedCopies} ${unmatchedCopies === 1 ? "copy" : "copies"} not in this buy` : ""}
      </p>
      {preview.lines.length > 0 ? (
        narrow ? (
          <ul className="gb-preview-list">
            {preview.lines.map((l) => (
              <li key={`${l.card_id}:${l.product_id ?? 0}`}>
                <span className="gb-preview-card">
                  <strong>{l.name || l.card_id}</strong> <span className="muted">{l.card_id}</span>
                </span>
                <span className="gb-preview-qty">
                  ×{l.qty} · {artLabel(byCard.get(l.card_id), l.product_id)}
                </span>
                <span className="muted gb-preview-who">{whoText(l.allocations, l.qty_extra)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <table className="data-table gb-preview-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Art</th>
                <th>In order</th>
                <th>Goes to</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={`${l.card_id}:${l.product_id ?? 0}`}>
                  <td>
                    <strong>{l.name || l.card_id}</strong> <span className="muted">{l.card_id}</span>
                  </td>
                  <td>{artLabel(byCard.get(l.card_id), l.product_id)}</td>
                  <td>{l.qty}</td>
                  <td>{whoText(l.allocations, l.qty_extra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <p className="muted">No lines matched this group buy.</p>
      )}
      {preview.unmatched.length > 0 ? (
        <ul className="gb-unmatched" aria-label="Lines not in this buy">
          {preview.unmatched.map((u, i) => (
            <li key={i}>
              <span className="gb-chip gb-chip-none">Not in this buy</span>
              <span className="gb-unmatched-text">
                {u.qty} × {u.card_name || u.description}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {preview.unmatched.length > 0 ? <p className="muted gb-preview-note">Those lines are left out of this order.</p> : null}
    </div>
  );
}

function CardPicker({
  lines,
  picks,
  onChange,
}: {
  lines: GroupBuyLine[];
  picks: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const pickable = pickableLines(lines);
  const allOn = pickable.every((l) => (picks[l.card_id] ?? 0) > 0);
  const setAll = (on: boolean) => onChange(Object.fromEntries(pickable.map((l) => [l.card_id, on ? (l.not_ordered ?? 0) : 0])));
  if (pickable.length === 0) return <p className="muted">Every copy is already in an order.</p>;
  return (
    <div className="gb-picker">
      <div className="gb-picker-bar">
        <span className="muted">Cards with copies not in an order yet</span>
        <button type="button" className="gb-link-btn" onClick={() => setAll(!allOn)}>
          {allOn ? "Select none" : "Select all"}
        </button>
      </div>
      <ul className="gb-picker-list">
        {pickable.map((l) => {
          const max = l.not_ordered ?? 0;
          const qty = Math.min(picks[l.card_id] ?? 0, max);
          const set = (n: number) => onChange({ ...picks, [l.card_id]: Math.max(0, Math.min(max, n)) });
          return (
            <li key={l.card_id} className="gb-picker-row">
              <input
                type="checkbox"
                className="gb-picker-check"
                aria-label={`Include ${l.name || l.card_id}`}
                checked={qty > 0}
                onChange={(e) => set(e.target.checked ? max : 0)}
              />
              <CardThumb src={lineArtUrl(l)} cardId={l.card_id} alt={l.name} />
              <span className="gb-picker-name">
                <strong>{l.name}</strong>
                <span className="muted">
                  {l.card_id} · {max} not in an order yet
                </span>
              </span>
              <span className="gb-stepper-ctl">
                <button type="button" className="owned-btn" aria-label={`Fewer ${l.card_id}`} disabled={qty <= 0} onClick={() => set(qty - 1)}>
                  −
                </button>
                <span className="gb-stepper-val" aria-live="polite">
                  {qty}
                </span>
                <button type="button" className="owned-btn" aria-label={`More ${l.card_id}`} disabled={qty >= max} onClick={() => set(qty + 1)}>
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AddOrderDialog({
  groupId,
  detail,
  onClose,
  onAdded,
}: {
  groupId: number;
  detail: GroupBuyDetail;
  onClose: () => void;
  onAdded: (d: GroupBuyDetail, info: { copies: number; unmatched: number; arrived: boolean }) => void;
}) {
  const narrow = useGroupBuyListNarrow();
  const [orderNumber, setOrderNumber] = useState("");
  const [seller, setSeller] = useState("");
  const [tracking, setTracking] = useState("");
  const [paste, setPaste] = useState("");
  const [manual, setManual] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [arrivedNow, setArrivedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasteText = paste.trim();
  const debounced = useDebounced(pasteText, PREVIEW_DELAY_MS);
  const settled = debounced === pasteText;
  const previewQ = useQuery({
    queryKey: qk.groupBuy.orderPreview(groupId, debounced),
    queryFn: () => api.previewGroupBuyOrder(groupId, debounced),
    enabled: !manual && debounced.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const preview = !manual && pasteText && settled ? previewQ.data : undefined;

  const pickedLines = useMemo(() => pickedOrderLines(detail.lines, picks), [detail.lines, picks]);
  const pickedCopies = pickedLines.reduce((s, l) => s + l.qty, 0);
  const matchedCopies = preview ? preview.lines.reduce((s, l) => s + l.qty, 0) : 0;
  const copies = manual ? pickedCopies : matchedCopies;

  const startManual = () => {
    setPicks(Object.fromEntries(pickableLines(detail.lines).map((l) => [l.card_id, l.not_ordered ?? 0])));
    setManual(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.addGroupBuyOrder(groupId, {
        order_number: orderNumber.trim(),
        seller_name: seller.trim(),
        tracking_url: tracking.trim(),
        mark_arrived: arrivedNow,
        ...(manual ? { lines: pickedLines } : pasteText ? { receipt_text: paste } : {}),
      }),
    onSuccess: (res) => onAdded(res.detail, { copies, unmatched: res.unmatched.length, arrived: arrivedNow }),
    onError: (e: Error) => setError(e.message),
  });

  const hasItems = manual ? pickedCopies > 0 : pasteText.length > 0;
  const canSave = !save.isPending && (orderNumber.trim().length > 0 || hasItems);
  const saveLabel = save.isPending ? "Saving…" : copies > 0 ? `Save order · ${copies} ${copies === 1 ? "copy" : "copies"}` : "Save order";

  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-full" panelClassName="gb-dialog-panel" label="Add order" closeOnOutsideClick={false}>
      <form
        className="gb-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) {
            setError(null);
            save.mutate();
          }
        }}
      >
        <div className="gb-dialog-head">
          <DialogTitle as="h2" className="gb-dialog-title">
            Add a TCGplayer order
          </DialogTitle>
          <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gb-dialog-body gb-add-cols">
          <div className="gb-add-left">
            <div className="gb-order-fields">
              <label>
                <span>Order number</span>
                <input type="text" value={orderNumber} maxLength={200} autoComplete="off" onChange={(e) => setOrderNumber(e.target.value)} placeholder="8F3A21C0-77C1A0-1B3E4" />
              </label>
              <label>
                <span>
                  Seller <span className="muted">(optional)</span>
                </span>
                <input type="text" value={seller} maxLength={200} autoComplete="off" onChange={(e) => setSeller(e.target.value)} placeholder="Grand Line Singles" />
              </label>
              <label className="gb-field-wide">
                <span>
                  Tracking link <span className="muted">(optional, https)</span>
                </span>
                <input type="text" inputMode="url" value={tracking} maxLength={1000} autoComplete="off" onChange={(e) => setTracking(e.target.value)} placeholder="https://tools.usps.com/…" />
              </label>
            </div>
            {manual ? null : (
              <label className="gb-paste">
                <span>
                  Paste the order's items <span className="muted">(whole page or email is fine)</span>
                </span>
                <textarea
                  value={paste}
                  maxLength={200_000}
                  rows={4}
                  spellCheck={false}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={"TCGplayer > Order History > this order. Select the Qty / Description table and copy."}
                />
              </label>
            )}
            <button type="button" className="gb-link-btn gb-mode-toggle" onClick={() => (manual ? setManual(false) : startManual())}>
              {manual ? "Paste an order instead" : "Pick cards by hand instead"}
            </button>
          </div>
          <div className="gb-add-right">
            {manual ? (
              <CardPicker lines={detail.lines} picks={picks} onChange={setPicks} />
            ) : (
              <div className="gb-preview-slot" aria-live="polite">
                {preview ? (
                  <PreviewResult preview={preview} lines={detail.lines} narrow={narrow} />
                ) : pasteText ? (
                  <p className="muted gb-preview-wait">{previewQ.isError ? (previewQ.error as Error).message : "Matching…"}</p>
                ) : (
                  <p className="muted gb-preview-wait">Paste an order to see which cards it covers and who gets each copy.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="gb-dialog-foot">
          <label className="gb-check">
            <input type="checkbox" checked={arrivedNow} onChange={(e) => setArrivedNow(e.target.checked)} />
            <span>
              All arrived now <span className="muted">(adds the copies to Owned)</span>
            </span>
          </label>
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!canSave}>
              {saveLabel}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
