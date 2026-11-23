import type { GroupBuyDetail } from "../../api";
import { canConfirmReceived, handoffChip, myHandoffText } from "./handoff";
import { StatusChip } from "./PackagesSection";
import { useGroupBuyHandoff } from "./useGroupBuyHandoff";

/** A member's own hand-off line, shown with Your cards. */
export function MyHandoff({
  detail,
  userId,
  onMessage,
}: {
  detail: GroupBuyDetail;
  userId: number | undefined;
  onMessage: (message: string | null) => void;
}) {
  const { confirmReceived, busy } = useGroupBuyHandoff(detail.id, onMessage);
  const me = (detail.members ?? []).find((m) => m.user_id === userId);
  if (!me || me.role === "host" || !me.handoff_status) return null;
  const text = myHandoffText(me);
  if (!text) return null;
  const status = me.handoff_status;
  const chip = handoffChip(status);
  return (
    <section className="gb-myhandoff" aria-label="Your hand-off" data-testid="gb-my-handoff">
      <span className="gb-myhandoff-text">
        <span className="muted">Hand-off: </span>
        {status === "waiting" || (status === "received" && (me.ready_to_hand_over ?? 0) > 0) ? (
          <strong>{text}</strong>
        ) : (
          <StatusChip {...chip} />
        )}
        {status === "shipped" && me.handoff_tracking_url ? (
          <>
            {" · "}
            <a href={me.handoff_tracking_url} target="_blank" rel="noopener noreferrer">
              Track
            </a>
          </>
        ) : null}
        {me.handoff_note ? <span className="muted"> · {me.handoff_note}</span> : null}
      </span>
      {canConfirmReceived(status) ? (
        <button type="button" className="btn primary" disabled={busy} onClick={() => confirmReceived.mutate()}>
          I got my cards
        </button>
      ) : null}
    </section>
  );
}
