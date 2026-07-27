import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  api,
  GroupBuyDetail,
  GroupBuyReceiptLine,
  GroupBuyReceiptMatchReport,
} from "./api";

const STATUS_LABEL: Record<string, string> = {
  exact: "Matched",
  surplus: "Surplus",
  short: "Short",
  missing: "Missing",
  extra: "Extra",
};

type Props = {
  groupId: number;
  isHost: boolean;
  status: string;
  onApplied: (detail: GroupBuyDetail, message: string) => void;
  onError: (message: string) => void;
};

function defaultSelected(report: GroupBuyReceiptMatchReport): Set<string> {
  const next = new Set<string>();
  for (const line of report.lines) {
    if (line.staged_qty > 0 && (line.status === "exact" || line.status === "surplus" || line.status === "short")) {
      next.add(line.card_id);
    }
  }
  return next;
}

function poolLines(report: GroupBuyReceiptMatchReport): GroupBuyReceiptLine[] {
  return report.lines.filter((l) => l.status !== "extra");
}

export function ReceiptImportPanel({ groupId, isHost, status, onApplied, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [report, setReport] = useState<GroupBuyReceiptMatchReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canUse = status === "locked" || status === "ordered";

  useEffect(() => {
    if (!canUse) {
      setOpen(false);
      setReport(null);
    }
  }, [canUse]);

  const match = useMutation({
    mutationFn: () => api.matchGroupBuyReceipt(groupId, text),
    onSuccess: (data) => {
      setReport(data);
      setSelected(defaultSelected(data));
    },
    onError: (e: Error) => onError(e.message),
  });

  const apply = useMutation({
    mutationFn: () =>
      api.applyGroupBuyReceipt(groupId, {
        receipt_text: text,
        card_ids: [...selected],
        allow_partial: true,
      }),
    onSuccess: (detail) => {
      const staged = selected.size;
      const finished = detail.status === "completed";
      onApplied(
        detail,
        finished
          ? `Receipt applied — all staged cards marked purchased (${staged} lines). Owned updated.`
          : `Receipt staged — applied ${staged} line(s) to Owned. Remaining pool stays ordered until the rest arrives.`,
      );
      setReport(null);
      setText("");
      setSelected(new Set());
      setOpen(false);
    },
    onError: (e: Error) => onError(e.message),
  });

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

  const stagedCopies = useMemo(() => {
    if (!report) return 0;
    return report.lines
      .filter((l) => selected.has(l.card_id))
      .reduce((sum, l) => sum + l.staged_qty, 0);
  }, [report, selected]);

  if (!isHost || !canUse) return null;

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
    match.mutate();
  }

  function onApplyClick() {
    if (!report || selected.size === 0) return;
    const shorts = report.lines.filter(
      (l) => selected.has(l.card_id) && (l.status === "short" || l.status === "missing"),
    ).length;
    const missingPool = report.lines.some((l) => l.status === "missing");
    const ok = window.confirm(
      (report.can_apply_full && selected.size === poolLines(report).length
        ? "Apply the full receipt and mark this group buy purchased?\n\n"
        : "Stage selected receipt copies onto Owned?\n\n") +
        `${selected.size} card line(s), ${stagedCopies} copies will be added to Owned` +
        (shorts || missingPool
          ? ".\n\nSome lines are short or missing — leftover pool quantities stay ordered."
          : ".") +
        (status === "locked" ? "\n\nThis will also mark the pool as ordered." : ""),
    );
    if (ok) apply.mutate();
  }

  return (
    <div className="group-buy-receipt">
      <div className="group-buy-receipt-head">
        <h2>TCGPlayer receipt</h2>
        <button
          type="button"
          className="btn secondary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide import" : "Import receipt"}
        </button>
      </div>
      <p className="muted">
        Paste order details (Qty + Description) to verify what you bought against this pool, then
        stage matched copies onto Owned.
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
            {report ? (
              <button
                type="button"
                className="btn primary"
                disabled={apply.isPending || stagedCopies <= 0}
                onClick={onApplyClick}
              >
                {apply.isPending
                  ? "Applying…"
                  : report.can_apply_full && selected.size === poolLines(report).length
                    ? "Apply & mark purchased"
                    : `Stage ${stagedCopies} copies`}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {open && report ? (
        <div className="group-buy-receipt-report">
          <p className="group-buy-receipt-summary" role="status">
            {summaryBits?.join(" · ") || "No differences"}
            {" · "}
            {report.summary.receipt_copies ?? 0} receipt copies · {report.summary.needed_copies ?? 0}{" "}
            needed · {stagedCopies} selected to stage
          </p>
          <div className="group-buy-receipt-select-actions">
            <button type="button" className="ghost" onClick={selectAllStaged}>
              Select matched
            </button>
            <button type="button" className="ghost" onClick={clearSelection}>
              Clear
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table group-buy-receipt-table">
              <thead>
                <tr>
                  <th scope="col" className="group-buy-receipt-check">
                    Stage
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Card</th>
                  <th scope="col">Need</th>
                  <th scope="col">Receipt</th>
                  <th scope="col">Apply</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => {
                  const canStage = line.staged_qty > 0;
                  return (
                    <tr key={`${line.card_id}-${line.status}`} className={`receipt-status-${line.status}`}>
                      <td className="group-buy-receipt-check">
                        {canStage ? (
                          <input
                            type="checkbox"
                            checked={selected.has(line.card_id)}
                            onChange={() => toggleCard(line.card_id)}
                            aria-label={`Stage ${line.name || line.card_id}`}
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
