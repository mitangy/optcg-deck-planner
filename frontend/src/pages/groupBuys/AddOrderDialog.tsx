import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type GroupBuyDetail, type GroupBuyLine, type GroupBuyOrder, type GroupBuyOrderHistoryPreview } from "../../api";
import { qk } from "../../cache/queryKeys";
import { useGroupBuyListNarrow } from "../../hooks/useGroupBuyListNarrow";
import { CardThumb } from "../../ui/CardThumb";
import { HistoryOrders } from "./HistoryOrders";
import { addOrdersLabel, carryHistorySelection, historyCopies, looksLikeOrderHistory, pickableLines, pickedHistoryNumbers, pickedOrderLines, startingHistorySelection, startingPicks } from "./groupBuyOrders";
import { PreviewResult } from "./OrderPreview";
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

function CardPicker({
  pickable,
  picks,
  onChange,
}: {
  pickable: GroupBuyLine[];
  picks: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
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

/** Adds an order, or with `order` edits one: number, seller, tracking, and its items while nothing in it has arrived. */
export function AddOrderDialog({
  groupId,
  detail,
  order,
  onClose,
  onAdded,
}: {
  groupId: number;
  detail: GroupBuyDetail;
  order?: GroupBuyOrder;
  onClose: () => void;
  onAdded: (d: GroupBuyDetail, info: { copies: number; unmatched: number; arrived: boolean; edited: boolean; orders?: number }) => void;
}) {
  const narrow = useGroupBuyListNarrow();
  const itemsLocked = Boolean(order && order.qty_arrived > 0);
  const [orderNumber, setOrderNumber] = useState(order?.order_number ?? "");
  const [seller, setSeller] = useState(order?.seller_name ?? "");
  const [tracking, setTracking] = useState(order?.tracking_url ?? "");
  const [itemsTouched, setItemsTouched] = useState(false);
  const [paste, setPaste] = useState("");
  const [manual, setManual] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [arrivedNow, setArrivedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pdf, setPdf] = useState<{ names: string[]; preview: GroupBuyOrderHistoryPreview } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ source: GroupBuyOrderHistoryPreview; set: Set<string> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pasteText = paste.trim();
  const debounced = useDebounced(pasteText, PREVIEW_DELAY_MS);
  const settled = debounced === pasteText;
  // A whole Order History page (pasted or uploaded) adds many orders at once; a single order keeps the form below.
  const historyMode = !order && !manual && (pdf !== null || looksLikeOrderHistory(pasteText));
  const historyQ = useQuery({
    queryKey: qk.groupBuy.orderHistoryPreview(groupId, debounced),
    queryFn: () => api.previewGroupBuyOrderHistory(groupId, debounced),
    enabled: historyMode && pdf === null && looksLikeOrderHistory(debounced),
    staleTime: 60_000,
    retry: false,
  });
  const historyPreview = !historyMode ? undefined : pdf ? pdf.preview : settled ? historyQ.data : undefined;
  const historyText = pdf ? pdf.preview.text : paste;
  const defaultPick = useMemo(() => (historyPreview ? new Set(startingHistorySelection(historyPreview.orders)) : new Set<string>()), [historyPreview]);
  const selection = picked && picked.source === historyPreview ? picked.set : defaultPick;
  const pickedNumbers = historyPreview ? pickedHistoryNumbers(historyPreview.orders, selection) : [];

  const readPdf = useMutation({
    // The text already loaded (earlier uploads or a pasted page) goes along so the list grows.
    mutationFn: (files: File[]) => api.previewGroupBuyOrderHistoryPdf(groupId, files, pdf ? pdf.preview.text : looksLikeOrderHistory(pasteText) ? paste : undefined),
    onSuccess: (res, files) => {
      setPdfError(null);
      setPicked({ source: res, set: carryHistorySelection(historyPreview?.orders ?? [], selection, res.orders) });
      setPdf({ names: [...(pdf?.names ?? []), ...files.map((f) => f.name)], preview: res });
    },
    onError: (e: Error) => setPdfError(e.message),
  });

  const previewQ = useQuery({
    queryKey: qk.groupBuy.orderPreview(groupId, debounced),
    queryFn: () => api.previewGroupBuyOrder(groupId, debounced),
    enabled: !manual && !historyMode && debounced.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const preview = !manual && !historyMode && pasteText && settled ? previewQ.data : undefined;

  const pickable = useMemo(() => pickableLines(detail.lines, order), [detail.lines, order]);
  const pickedLines = useMemo(() => pickedOrderLines(detail.lines, picks, order), [detail.lines, picks, order]);
  const pickedCopies = pickedLines.reduce((s, l) => s + l.qty, 0);
  const matchedCopies = preview ? preview.lines.reduce((s, l) => s + l.qty, 0) : 0;
  const copies = historyMode ? (historyPreview ? historyCopies(historyPreview.orders, selection) : 0) : manual ? pickedCopies : matchedCopies;

  const startManual = () => {
    setPicks(startingPicks(detail.lines, order));
    setManual(true);
  };

  const hasItems = manual ? pickedCopies > 0 && (!order || itemsTouched) : pasteText.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (historyMode) {
        const res = await api.importGroupBuyOrderHistory(groupId, historyText, pickedNumbers);
        return { detail: res.detail, unmatched: res.unmatched.length, orders: res.order_ids.length };
      }
      if (!order) {
        const res = await api.addGroupBuyOrder(groupId, {
          order_number: orderNumber.trim(),
          seller_name: seller.trim(),
          tracking_url: tracking.trim(),
          mark_arrived: arrivedNow,
          ...(manual ? { lines: pickedLines } : pasteText ? { receipt_text: paste } : {}),
        });
        return { detail: res.detail, unmatched: res.unmatched.length };
      }
      // Details first (PATCH bumps the version), then the items against that new version.
      let version = order.version;
      let latest: GroupBuyDetail | null = null;
      const detailsChanged =
        orderNumber.trim() !== order.order_number || seller.trim() !== order.seller_name || tracking.trim() !== order.tracking_url;
      if (detailsChanged) {
        latest = await api.updateGroupBuyOrderDetails(groupId, order.id, {
          expected_version: version,
          order_number: orderNumber.trim(),
          seller_name: seller.trim(),
          tracking_url: tracking.trim(),
        });
        version = latest.orders?.find((o) => o.id === order.id)?.version ?? version + 1;
      }
      let unmatched = 0;
      if (hasItems && !itemsLocked) {
        const res = await api.setGroupBuyOrderLines(groupId, order.id, {
          expected_version: version,
          ...(manual ? { lines: pickedLines } : { receipt_text: paste }),
        });
        latest = res.detail;
        unmatched = res.unmatched.length;
      }
      return { detail: latest ?? detail, unmatched };
    },
    onSuccess: (res) =>
      onAdded(res.detail, { copies, unmatched: res.unmatched, arrived: arrivedNow, edited: Boolean(order), orders: "orders" in res ? res.orders : undefined }),
    onError: (e: Error) => setError(e.message),
  });

  const canSave = historyMode
    ? !save.isPending && pickedNumbers.length > 0
    : !save.isPending && (orderNumber.trim().length > 0 || hasItems || Boolean(order));
  const saveLabel = save.isPending
    ? "Saving…"
    : historyMode
      ? addOrdersLabel(pickedNumbers.length)
      : order
      ? copies > 0 && hasItems
        ? `Save changes · ${copies} ${copies === 1 ? "copy" : "copies"}`
        : "Save changes"
      : copies > 0
        ? `Save order · ${copies} ${copies === 1 ? "copy" : "copies"}`
        : "Save order";

  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-full" panelClassName="gb-dialog-panel" label={order ? "Edit order" : "Add order"} closeOnOutsideClick={false}>
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
            {order ? "Edit order" : historyMode ? "Add TCGplayer orders" : "Add a TCGplayer order"}
          </DialogTitle>
          <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gb-dialog-body gb-add-cols">
          <div className="gb-add-left">
            {historyMode ? (
              <p className="muted gb-history-hint">Each order's number, seller and tracking link are read from the page. Tick the orders that are part of this group buy.</p>
            ) : (
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
            )}
            {manual || itemsLocked ? null : (
              <label className="gb-paste">
                <span>
                  Paste one order's items, or your whole Order History page <span className="muted">(Ctrl+A, Ctrl+C)</span>
                </span>
                <textarea
                  value={paste}
                  maxLength={400_000}
                  rows={4}
                  spellCheck={false}
                  onChange={(e) => {
                    setPaste(e.target.value);
                    setPdf(null);
                  }}
                  placeholder={"TCGplayer > Order History. Select the whole page and copy it, or copy one order's Qty / Description table."}
                />
              </label>
            )}
            {order || manual ? null : (
              <div className="gb-upload">
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  className="gb-file-input"
                  aria-label="Order History PDFs"
                  tabIndex={-1}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length > 0) {
                      setPdfError(null);
                      readPdf.mutate(files);
                    }
                  }}
                />
                <span className="muted gb-upload-text">Saved the Order History pages as PDFs? Upload them (one per page).</span>
                <button type="button" className="btn secondary gb-upload-btn" disabled={readPdf.isPending} onClick={() => fileInput.current?.click()}>
                  Upload PDFs
                </button>
                <p className="muted gb-upload-status" aria-live="polite" role={pdfError ? "alert" : undefined}>
                  {readPdf.isPending ? (
                    "Reading the PDFs…"
                  ) : pdfError ? (
                    <span className="error">{pdfError}</span>
                  ) : pdf ? (
                    <>
                      <span className="gb-upload-names">Read {pdf.names.join(", ")}</span>{" "}
                      <button
                        type="button"
                        className="gb-link-btn"
                        onClick={() => {
                          setPdf(null);
                          setPicked(null);
                          setPdfError(null);
                        }}
                      >
                        Start over
                      </button>
                    </>
                  ) : (
                    ""
                  )}
                </p>
              </div>
            )}
            {itemsLocked || historyMode ? null : (
              <button type="button" className="gb-link-btn gb-mode-toggle" onClick={() => (manual ? setManual(false) : startManual())}>
                {manual ? "Paste an order instead" : "Pick cards by hand instead"}
              </button>
            )}
          </div>
          <div className="gb-add-right">
            {itemsLocked ? (
              <p className="muted">Some of this order has arrived. Undo its arrival to change what is in it.</p>
            ) : manual ? (
              <CardPicker
                pickable={pickable}
                picks={picks}
                onChange={(next) => {
                  setItemsTouched(true);
                  setPicks(next);
                }}
              />
            ) : historyMode ? (
              <div className="gb-preview-slot" aria-live="polite">
                {historyPreview ? (
                  <HistoryOrders
                    orders={historyPreview.orders}
                    selected={selection}
                    lines={detail.lines}
                    narrow={narrow}
                    onChange={(set) => setPicked({ source: historyPreview, set })}
                  />
                ) : (
                  <p className="muted gb-preview-wait">
                    {readPdf.isPending ? "Reading the PDFs…" : historyQ.isError ? (historyQ.error as Error).message : "Matching your orders…"}
                  </p>
                )}
              </div>
            ) : (
              <div className="gb-preview-slot" aria-live="polite">
                {preview ? (
                  <PreviewResult preview={preview} lines={detail.lines} narrow={narrow} />
                ) : pasteText ? (
                  <p className="muted gb-preview-wait">{previewQ.isError ? (previewQ.error as Error).message : "Matching…"}</p>
                ) : (
                  <p className="muted gb-preview-wait">Paste an order, or your whole Order History page, to see which cards it covers and who gets each copy.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="gb-dialog-foot">
          {order || historyMode ? null : (
            <label className="gb-check">
              <input type="checkbox" checked={arrivedNow} onChange={(e) => setArrivedNow(e.target.checked)} />
              <span>
                All arrived now <span className="muted">(adds the copies to Owned)</span>
              </span>
            </label>
          )}
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
