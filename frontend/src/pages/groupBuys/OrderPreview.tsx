import type { GroupBuyLine, GroupBuyOrderPreview } from "../../api";
import { artLabel } from "./groupBuyOrders";

export function whoText(allocations: { display_name: string; qty: number }[], extra: number): string {
  const parts = allocations.map((a) => `${a.display_name} ×${a.qty}`);
  if (extra > 0) parts.push(`${extra} extra`);
  return parts.join(", ") || "Nobody needs it";
}

export function PreviewSummary({ preview }: { preview: Pick<GroupBuyOrderPreview, "lines" | "unmatched"> }) {
  const copies = preview.lines.reduce((s, l) => s + l.qty, 0);
  const unmatchedCopies = preview.unmatched.reduce((s, u) => s + u.qty, 0);
  return (
    <p className="muted gb-preview-sum">
      {preview.lines.length} {preview.lines.length === 1 ? "card" : "cards"} · {copies} {copies === 1 ? "copy" : "copies"} matched
      {preview.unmatched.length ? ` · ${unmatchedCopies} ${unmatchedCopies === 1 ? "copy" : "copies"} not in this buy` : ""}
    </p>
  );
}

/** The matched cards with who gets each, then the lines that are not in this buy. */
export function PreviewBody({ preview, lines, narrow }: { preview: Pick<GroupBuyOrderPreview, "lines" | "unmatched">; lines: GroupBuyLine[]; narrow: boolean }) {
  const byCard = new Map(lines.map((l) => [l.card_id, l]));
  return (
    <>
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
    </>
  );
}

export function PreviewResult({ preview, lines, narrow }: { preview: GroupBuyOrderPreview; lines: GroupBuyLine[]; narrow: boolean }) {
  return (
    <div className="gb-preview" data-testid="gb-order-preview">
      <h3 className="gb-preview-title">Matched to this group buy</h3>
      <PreviewSummary preview={preview} />
      <PreviewBody preview={preview} lines={lines} narrow={narrow} />
    </div>
  );
}

