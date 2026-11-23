import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { useState } from "react";
import type { GroupBuyDetail, GroupBuyMember } from "../../api";
import { handoffChip, handoffCounts, handoffMembers } from "./handoff";
import { MemberSwatch } from "./memberColors";
import { StatusChip } from "./PackagesSection";
import { useGroupBuyHandoff } from "./useGroupBuyHandoff";

function ShipDialog({
  member,
  saving,
  onSave,
  onClose,
}: {
  member: GroupBuyMember;
  saving: boolean;
  onSave: (trackingUrl: string, note: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(member.handoff_tracking_url ?? "");
  const [note, setNote] = useState(member.handoff_note ?? "");
  const bad = url.trim() !== "" && !/^https:\/\//i.test(url.trim());
  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-sheet" panelClassName="gb-dialog-panel" label="Mark shipped">
      <div className="gb-dialog-form">
        <div className="gb-dialog-head">
          <DialogTitle as="h2" className="gb-dialog-title">
            Ship to {member.display_name}
          </DialogTitle>
          <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gb-dialog-body">
          <label className="gb-handoff-field">
            Tracking link (optional)
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              aria-invalid={bad}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="gb-handoff-field">
            Note (optional)
            <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {bad ? "The tracking link must start with https://" : ""}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={saving || bad} onClick={() => onSave(url.trim(), note.trim())}>
              {saving ? "Saving…" : "Mark shipped"}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Host: one row per member, once packages are being tracked. */
export function HandoffPanel({
  detail,
  onMessage,
}: {
  detail: GroupBuyDetail;
  onMessage: (message: string | null) => void;
}) {
  const { setHandoff, busy } = useGroupBuyHandoff(detail.id, onMessage);
  const [shipping, setShipping] = useState<number | null>(null);
  const members = detail.members ?? [];
  const rows = handoffMembers(members);
  if (rows.length === 0) return null;
  const shipMember = rows.find((m) => m.user_id === shipping) ?? null;
  const send = (m: GroupBuyMember, body: Parameters<typeof setHandoff.mutate>[0]["body"]) =>
    setHandoff.mutate({ userId: m.user_id, body });

  return (
    <section className="gb-handoff" aria-label="Hand-off" data-testid="gb-handoff">
      <h2 className="gb-section-heading">Hand-off</h2>
      <ul className="gb-handoff-list">
        {rows.map((m) => {
          const status = m.handoff_status || "waiting";
          const chip = handoffChip(status);
          const ready = m.ready_to_hand_over ?? 0;
          const canMark = ready > 0 || status === "waiting";
          return (
            <li key={m.user_id} className="gb-handoff-row" data-testid="gb-handoff-row">
              <span className="gb-handoff-who">
                <MemberSwatch userId={m.user_id} members={members} />
                <strong className="gb-handoff-name">{m.display_name}</strong>
              </span>
              <span className="gb-handoff-counts muted">{handoffCounts(m)}</span>
              <span className="gb-handoff-state">
                <StatusChip {...chip} />
                {m.handoff_tracking_url ? (
                  <a href={m.handoff_tracking_url} target="_blank" rel="noopener noreferrer" className="gb-handoff-track">
                    Track
                  </a>
                ) : null}
              </span>
              <button
                type="button"
                className={`btn secondary gb-paid-toggle${m.paid ? " on" : ""}`}
                aria-pressed={!!m.paid}
                disabled={busy}
                onClick={() => send(m, { paid: !m.paid })}
              >
                <span aria-hidden="true">{m.paid ? "✓ " : "○ "}</span>
                {m.paid ? "Paid" : "Not paid"}
              </button>
              <span className="gb-handoff-actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || !canMark || (status === "waiting" && ready === 0)}
                  title={ready === 0 && status === "waiting" ? "Nothing has arrived for them yet" : undefined}
                  onClick={() => send(m, { status: "handed_over" })}
                >
                  Mark handed over
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || !canMark || (status === "waiting" && ready === 0)}
                  onClick={() => setShipping(m.user_id)}
                >
                  Mark shipped
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || status === "waiting"}
                  onClick={() => send(m, { status: "waiting" })}
                >
                  Undo
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {shipMember ? (
        <ShipDialog
          key={shipMember.user_id}
          member={shipMember}
          saving={busy}
          onClose={() => setShipping(null)}
          onSave={(tracking_url, note) => {
            setHandoff.mutate(
              { userId: shipMember.user_id, body: { status: "shipped", tracking_url, note } },
              { onSuccess: () => setShipping(null) },
            );
          }}
        />
      ) : null}
    </section>
  );
}
