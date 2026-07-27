import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { GroupBuyReceiptLine, GroupBuyReceiptMatchReport } from "./api";
import { api } from "./api";

const STATUS_LABEL: Record<string, string> = {
  exact: "Matched",
  surplus: "Surplus",
  short: "Short",
  missing: "Missing",
  extra: "Extra",
};

/** Lines that are clean receipt↔pool matches (hidden by default). */
function isMatchedLine(line: GroupBuyReceiptLine): boolean {
  return line.status === "exact";
}

/** Problem / mismatch lines shown by default in the report table. */
function isMismatchLine(line: GroupBuyReceiptLine): boolean {
  return !isMatchedLine(line);
}

function defaultSelected(report: GroupBuyReceiptMatchReport): Set<string> {
  const next = new Set<string>();
  for (const line of report.lines) {
    if (line.staged_qty > 0 && (line.status === "exact" || line.status === "surplus" || line.status === "short")) {
      next.add(line.card_id);
    }
  }
  return next;
}

export type ReceiptApplyDraft = {
  receiptText: string;
  selectedCardIds: string[];
  stagedCopies: number;
  canApply: boolean;
  lineCount: number;
};

type Props = {
  groupId: number;
  isHost: boolean;
  status: string;
  /** Saved paste from the server (survives refresh). */
  initialReceiptText?: string;
  onDraftChange: (draft: ReceiptApplyDraft | null) => void;
  onError: (message: string) => void;
  /** Called after a successful match so the parent can refresh has_receipt. */
  onReceiptSaved?: () => void;
};

export function ReceiptImportPanel({
  groupId,
  isHost,
  status,
  initialReceiptText = "",
  onDraftChange,
  onError,
  onReceiptSaved,
}: Props) {
  const savedText = (initialReceiptText || "").trim();
  const [open, setOpen] = useState(() => status === "ordered" || status === "locked");
  const [text, setText] = useState(savedText);
  const [report, setReport] = useState<GroupBuyReceiptMatchReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMatched, setShowMatched] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const onReceiptSavedRef = useRef(onReceiptSaved);
  onReceiptSavedRef.current = onReceiptSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const autoMatchKeyRef = useRef<string | null>(null);

  const canUse = isHost && (status === "locked" || status === "ordered");

  const stagedCopies = useMemo(() => {
    if (!report) return 0;
    return report.lines
      .filter((l) => selected.has(l.card_id))
      .reduce((sum, l) => sum + l.staged_qty, 0);
  }, [report, selected]);

  useEffect(() => {
    if (!canUse) {
      setOpen(false);
      setReport(null);
      setSelected(new Set());
      setText("");
      onDraftChangeRef.current(null);
      autoMatchKeyRef.current = null;
    }
  }, [canUse]);

  // Hydrate from server-saved paste when the panel mounts / group changes.
  useEffect(() => {
    if (!canUse) return;
    const next = (initialReceiptText || "").trim();
    setText((prev) => (prev.trim() ? prev : next));
  }, [canUse, initialReceiptText, groupId]);

  useEffect(() => {
    if (!canUse) return;
    if (!report || !text.trim()) {
      onDraftChangeRef.current(null);
      return;
    }
    const selectedCardIds = [...selected];
    onDraftChangeRef.current({
      receiptText: text,
      selectedCardIds,
      stagedCopies,
      canApply: stagedCopies > 0,
      lineCount: selectedCardIds.length,
    });
  }, [canUse, report, text, selected, stagedCopies]);

  const match = useMutation({
    mutationFn: (receiptText: string) => api.matchGroupBuyReceipt(groupId, receiptText),
    onSuccess: (data, receiptText) => {
      setReport(data);
      setSelected(defaultSelected(data));
      setShowMatched(false);
      setOpen(true);
      onReceiptSavedRef.current?.();
      if (receiptText.trim()) {
        autoMatchKeyRef.current = `${groupId}:${receiptText.trim()}`;
      }
    },
    onError: (e: Error) => onErrorRef.current(e.message),
  });

  // After refresh, rematch the server-saved receipt so Mark purchased stays available.
  useEffect(() => {
    if (!canUse) return;
    const paste = text.trim();
    const saved = (initialReceiptText || "").trim();
    if (!paste || !saved || paste !== saved || report || match.isPending) return;
    const key = `${groupId}:${paste}`;
    if (autoMatchKeyRef.current === key) return;
    autoMatchKeyRef.current = key;
    match.mutate(paste);
    // Intentionally omit `match` — rematch once per saved paste after refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rematch once per saved paste
  }, [canUse, groupId, text, initialReceiptText, report, match.isPending]);

  const summaryBits = useMemo(() => {
    if (!report) return null;
    const s = report.summary;
    return [
      s.exact ? `${s.exact} exact` : null,
      s.surplus ? `${s.surplus} surplus` : null,
      s.short ? `${s.short} short` : null,
      s.missing ? `${s.missing} missing` : null,
      s.extra ? `${s.extra} extra` : null,
      s.unmatched ? `${s.unmatched} unmatched` : null,
    ].filter(Boolean);
  }, [report]);

  const visibleLines = useMemo(() => {
    if (!report) return [];
    return report.lines.filter((l) => (showMatched ? true : isMismatchLine(l)));
  }, [report, showMatched]);

  const matchedCount = useMemo(
    () => (report ? report.lines.filter(isMatchedLine).length : 0),
    [report],
  );
  const mismatchCount = useMemo(
    () => (report ? report.lines.filter(isMismatchLine).length : 0),
    [report],
  );

  if (!canUse) return null;

  function toggleCard(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function selectAllStaged() {
    if (!report) return;
    setSelected(defaultSelected(report));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function onMatchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      onError("Paste TCGPlayer order line items first.");
      return;
    }
    match.mutate(text);
  }

  const matchedReady = Boolean(report && stagedCopies > 0);

  return (
    <div className="group-buy-receipt">
      <div className="group-buy-receipt-head">
        <h2>TCGPlayer receipt</h2>
        <div className="group-buy-receipt-head-actions">
          {matchedReady ? (
            <span className="group-buy-receipt-ready" role="status">
              Ready for Mark purchased
            </span>
          ) : savedText || text.trim() ? (
            <span className="group-buy-receipt-pending muted" role="status">
              {match.isPending ? "Matching saved receipt…" : "Match receipt to enable Mark purchased"}
            </span>
          ) : (
            <span className="group-buy-receipt-needed" role="status">
              Required
            </span>
          )}
          <button
            type="button"
            className="btn secondary"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide import" : "Import receipt"}
          </button>
        </div>
      </div>
      <p className="muted">
        Required before Mark purchased. Paste order details (Qty + Description), match to this pool,
        then use <strong>Mark purchased</strong> to add only the matched receipt copies to Owned.
        Your paste is saved on this group buy so it survives a refresh.
      </p>
      {open ? (
        <form className="group-buy-receipt-form" onSubmit={onMatchSubmit}>
          <label className="group-buy-receipt-paste">
            Receipt text
            <textarea
              value={text}
              rows={8}
              maxLength={200000}
              onChange={(e) => {
                setText(e.target.value);
                setReport(null);
                setSelected(new Set());
                autoMatchKeyRef.current = null;
              }}
              placeholder={
                "Qty\tDescription\n2\tOne Piece Card Game - Adventure on Kami's Island - Barrier Bulls - Near Mint\n…"
              }
              spellCheck={false}
            />
          </label>
          <div className="group-buy-receipt-actions">
            <button type="submit" className="btn secondary" disabled={match.isPending || !text.trim()}>
              {match.isPending ? "Matching…" : "Match to pool"}
            </button>
          </div>
        </form>
      ) : null}

      {open && report ? (
        <div className="group-buy-receipt-report">
          <p className="group-buy-receipt-summary" role="status">
            {summaryBits?.join(" · ") || "No differences"}
            {" · "}
            {report.summary.receipt_copies ?? 0} receipt copies · {report.summary.needed_copies ?? 0}{" "}
            needed · {stagedCopies} selected for Mark purchased
          </p>
          <div className="group-buy-receipt-select-actions">
            <label className="group-buy-receipt-show-matched">
              <input
                type="checkbox"
                checked={showMatched}
                onChange={(e) => setShowMatched(e.target.checked)}
              />
              Show matched cards
              {matchedCount > 0 ? ` (${matchedCount})` : ""}
            </label>
            <button type="button" className="ghost" onClick={selectAllStaged}>
              Select matched
            </button>
            <button type="button" className="ghost" onClick={clearSelection}>
              Clear
            </button>
          </div>
          {!showMatched && mismatchCount === 0 && matchedCount > 0 ? (
            <p className="muted group-buy-receipt-empty">
              All pool cards matched exactly. Turn on <strong>Show matched cards</strong> to review
              them, or Mark purchased to update Owned.
            </p>
          ) : null}
          {visibleLines.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table group-buy-receipt-table">
                <thead>
                  <tr>
                    <th scope="col" className="group-buy-receipt-check">
                      Include
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Card</th>
                    <th scope="col">Need</th>
                    <th scope="col">Receipt</th>
                    <th scope="col">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((line) => {
                    const canStage = line.staged_qty > 0;
                    return (
                      <tr
                        key={`${line.card_id}-${line.status}`}
                        className={`receipt-status-${line.status}`}
                      >
                        <td className="group-buy-receipt-check">
                          {canStage ? (
                            <input
                              type="checkbox"
                              checked={selected.has(line.card_id)}
                              onChange={() => toggleCard(line.card_id)}
                              aria-label={`Include ${line.name || line.card_id}`}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`receipt-pill status-${line.status}`}>
                            {STATUS_LABEL[line.status] || line.status}
                          </span>
                        </td>
                        <td>
                          <div className="group-buy-receipt-card">
                            <strong>{line.name || line.card_id}</strong>
                            <span className="muted">
                              {line.card_id}
                              {line.group_name ? ` · ${line.group_name}` : ""}
                            </span>
                          </div>
                        </td>
                        <td>{line.needed_qty}</td>
                        <td>{line.receipt_qty}</td>
                        <td>{canStage ? line.staged_qty : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {report.unmatched.length > 0 ? (
            <div className="group-buy-receipt-unmatched">
              <h3>Unmatched receipt lines</h3>
              <p className="muted">
                Could not map these to the catalog — check spelling or sync the catalog.
              </p>
              <ul>
                {report.unmatched.map((u, i) => (
                  <li key={`${u.description}-${i}`}>
                    <strong>{u.qty}×</strong> {u.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
