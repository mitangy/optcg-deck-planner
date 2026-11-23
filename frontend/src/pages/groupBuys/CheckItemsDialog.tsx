import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useRef, useState } from "react";
import type { GroupBuyLine, GroupBuyMember, GroupBuyOrder } from "../../api";
import { CardScanner } from "../../app/lazyPages";
import { CardThumb } from "../../ui/CardThumb";
import { MemberSwatch } from "./memberColors";
import { applyScans, scanSummary, type ScanReceiveState } from "./groupBuyScanReceive";
import { allArrivedDraft, arrivalDraft, artLabel, draftTotal, lineAllocated, orderLineArt, orderMissing, orderTitle } from "./groupBuyOrders";

/** Per-card arrived counts for one package. Desktop: a modal. Phone: a bottom sheet. Mount it with key={order.version} so a reloaded order restarts from the server's counts. */
export function CheckItemsDialog({
  order,
  index,
  lines,
  members,
  orders = [],
  saving,
  error,
  onSave,
  onClose,
}: {
  order: GroupBuyOrder;
  index: number;
  lines: GroupBuyLine[];
  members: GroupBuyMember[];
  /** All orders of the group buy, so a scanned card can point at the order that holds it. */
  orders?: GroupBuyOrder[];
  saving: boolean;
  error: string | null;
  onSave: (draft: Record<number, number>) => void;
  onClose: () => void;
}) {
  const [recv, setRecv] = useState<ScanReceiveState>(() => ({ draft: arrivalDraft(order), notInOrder: [] }));
  const recvRef = useRef(recv);
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<{ ids: number[]; n: number }>({ ids: [], n: 0 });
  const draft = recv.draft;
  const update = (next: ScanReceiveState) => {
    recvRef.current = next;
    setRecv(next);
  };
  const byCard = new Map(lines.map((l) => [l.card_id, l]));
  const total = order.qty_allocated;
  const arrived = draftTotal(draft);
  const set = (id: number, n: number, max: number) =>
    update({ ...recvRef.current, draft: { ...recvRef.current.draft, [id]: Math.max(0, Math.min(max, n)) } });
  const onScanned = (cards: { cardId: string }[], unread: number) => {
    const before = recvRef.current.notInOrder.reduce((n, e) => n + e.count, 0);
    const r = applyScans(order, orders, lines, recvRef.current, cards);
    update({ draft: r.draft, notInOrder: r.notInOrder });
    setFlash((f) => ({ ids: r.bumped, n: f.n + 1 }));
    return scanSummary(r.counted, r.notInOrder.reduce((n, e) => n + e.count, 0) - before, unread);
  };
  const saveWidth = `Save · ${total} of ${total} arrived`.length + 4;

  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-sheet" panelClassName="gb-dialog-panel" label="Check items" closeOnOutsideClick={false}>
      <div className="gb-dialog-form">
        <div className="gb-dialog-head">
          <DialogTitle as="h2" className="gb-dialog-title">
            Check items · {orderTitle(order, index)}
          </DialogTitle>
          <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gb-dialog-body gb-check-body">
        {orderMissing(order) > 0 ? (
          <div className="gb-check-tools">
            <button type="button" className="btn secondary" disabled={saving} onClick={() => setScanning(true)}>
              Scan cards
            </button>
            <span className="muted">Each card you scan counts as arrived. Save when the counts look right.</span>
          </div>
        ) : null}
        <ul className="gb-check-list">
          {order.lines.map((l) => {
            const max = lineAllocated(l);
            const have = Math.min(draft[l.id] ?? 0, max);
            const line = byCard.get(l.card_id);
            return (
              <li
                key={l.id}
                className="gb-check-row"
                data-flash={flash.ids.includes(l.id) ? flash.n % 2 : undefined}
                data-testid="gb-check-row"
              >
                <CardThumb src={orderLineArt(line, l.product_id)} cardId={l.card_id} alt={l.name || l.card_id} productId={l.product_id ?? undefined} />
                <div className="gb-check-info">
                  <strong className="gb-check-name">{l.name || l.card_id}</strong>
                  <span className="muted">
                    {l.card_id} · {artLabel(line, l.product_id)} · {max} to track
                    {l.qty_extra > 0 ? ` · ${l.qty_extra} extra` : ""}
                  </span>
                  <span className="gb-goes-to" aria-label="Goes to">
                    {l.allocations.map((a) => (
                      <span key={a.user_id} className="gb-member-chip">
                        <MemberSwatch userId={a.user_id} members={members} />
                        {a.display_name} ×{a.qty}
                      </span>
                    ))}
                  </span>
                </div>
                <span className="gb-stepper-ctl">
                  <button type="button" className="owned-btn" aria-label={`Fewer arrived ${l.card_id}`} disabled={have <= 0} onClick={() => set(l.id, have - 1, max)}>
                    −
                  </button>
                  <span className="gb-stepper-val" aria-label={`${have} of ${max} arrived`}>
                    {have}/{max}
                  </span>
                  <button type="button" className="owned-btn" aria-label={`More arrived ${l.card_id}`} disabled={have >= max} onClick={() => set(l.id, have + 1, max)}>
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        {recv.notInOrder.length > 0 ? (
          <section className="gb-check-extra" aria-label="Not in this order" data-testid="gb-scan-extra">
            <h3 className="gb-check-extra-title">Not in this order</h3>
            <ul>
              {recv.notInOrder.map((e) => (
                <li key={e.cardId}>
                  <strong>
                    {e.count} × {e.name}
                  </strong>
                  <span className="muted">
                    {e.cardId}
                    {e.elsewhere.length > 0 ? ` · In ${e.elsewhere.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" disabled={saving} onClick={() => update({ ...recvRef.current, draft: allArrivedDraft(order) })}>
              All arrived
            </button>
            <button type="button" className="btn primary gb-save-count" style={{ minWidth: `${saveWidth}ch` }} disabled={saving} onClick={() => onSave(draft)}>
              {saving ? "Saving…" : `Save · ${arrived} of ${total} arrived`}
            </button>
          </div>
        </div>
      </div>
      {scanning ? (
        <CardScanner
          items={[]}
          showNeed={false}
          multi={{ collect: onScanned }}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </Dialog>
  );
}
