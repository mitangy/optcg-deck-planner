import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { money } from "../api";
import { CardThumb } from "../CardThumb";
import { invalidateOwnedViews } from "../ownedCollection";
import { friendsApi, type Trade, type TradeLine, type TradeStatus } from "./friendsApi";
import { otherUsername, tradeSides } from "./tradeLogic";
import { dateLabel, Empty, LoadError } from "./ui";

const STATUS_LABEL: Record<TradeStatus, string> = {
  pending: "Waiting",
  countered: "Countered",
  accepted: "Agreed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Traded",
  expired: "Expired",
};

export function TradesPanel() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["trades"], queryFn: friendsApi.trades });
  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  const { incoming, outgoing, active, history } = data!;
  if (incoming.length + outgoing.length + active.length + history.length === 0) {
    return (
      <Empty title="No trades yet">Open a friend's page and pick their Spares tab to offer a trade. Offers you send and get show up here.</Empty>
    );
  }
  return (
    <div className="trades-panel">
      <TradeSection title="Offers for you" trades={incoming} />
      <TradeSection title="Active" trades={active} />
      <TradeSection title="Waiting on them" trades={outgoing} />
      <TradeSection title="History" trades={history} />
    </div>
  );
}

function TradeSection({ title, trades }: { title: string; trades: Trade[] }) {
  if (trades.length === 0) return null;
  return (
    <section className="trade-section" aria-label={title}>
      <h2>
        {title} <span className="muted">{trades.length}</span>
      </h2>
      <ul className="trade-list">
        {trades.map((t) => (
          <li key={t.id}>
            <TradeCard trade={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SideLines({ title, lines, value }: { title: string; lines: TradeLine[]; value: number | null }) {
  return (
    <div className="trade-side">
      <h3>
        {title} <span className="trade-side-value">{money(value)}</span>
      </h3>
      {lines.length === 0 ? (
        <p className="muted">Nothing</p>
      ) : (
        <ul className="trade-lines">
          {lines.map((l, i) => (
            <li key={`${l.card_id}-${l.product_id ?? "base"}-${i}`} className="trade-line">
              <CardThumb src={l.image_url || undefined} cardId={l.card_id} alt={l.name} />
              <span className="trade-line-text">
                <span className="trade-line-name">{l.name}</span>
                <span className="muted trade-line-sub">
                  {l.card_id}
                  {l.printing_label ? ` · ${l.printing_label}` : ""}
                  {l.market_price != null ? ` · ${money(l.market_price)}` : ""}
                </span>
              </span>
              <span className="trade-line-qty">×{l.qty}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TradeCard({ trade }: { trade: Trade }) {
  const qc = useQueryClient();
  const other = otherUsername(trade);
  const { iGive, iGet, iGiveValue, iGetValue } = tradeSides(trade);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["trades"] });
    void qc.invalidateQueries({ queryKey: ["trades-summary"] });
  };
  const run = useMutation({
    mutationFn: (fn: (id: number) => Promise<Trade>) => fn(trade.id),
    onSuccess: () => refresh(),
  });
  const applyChange = useMutation({
    mutationFn: (fn: (id: number) => Promise<Trade>) => fn(trade.id),
    onSuccess: () => {
      refresh();
      invalidateOwnedViews(qc);
      void qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });
  const busy = run.isPending || applyChange.isPending;
  const err = (run.error ?? applyChange.error) as Error | null;

  const incomingOffer = trade.status === "pending" && !trade.i_am_sender;
  const outgoingOffer = trade.status === "pending" && trade.i_am_sender;
  const agreed = trade.status === "accepted";
  const toApply = trade.status === "completed" && !trade.my_applied;
  const canUndo = trade.status === "completed" && trade.my_applied;

  const heading = incomingOffer ? `${other} offered you a trade` : outgoingOffer ? `Your offer to ${other}` : `Trade with ${other}`;

  return (
    <article className={`friend-card trade-card status-${trade.status}`} data-trade-id={trade.id}>
      <header className="trade-head">
        <h3>{heading}</h3>
        <span className={`trade-status status-${trade.status}`}>{STATUS_LABEL[trade.status]}</span>
        <span className="muted trade-date">
          {trade.status === "pending" ? `Expires ${dateLabel(trade.expires_at)}` : dateLabel(trade.completed_at ?? trade.responded_at ?? trade.created_at)}
        </span>
      </header>
      <div className="trade-sides">
        <SideLines title="You give" lines={iGive} value={iGiveValue} />
        <SideLines title="You get" lines={iGet} value={iGetValue} />
      </div>
      {trade.message ? <p className="trade-message">“{trade.message}”</p> : null}
      {agreed && <p className="muted trade-hint">Agreed. Swap the cards, then press We traded.</p>}
      {toApply && <p className="muted trade-hint">You traded. Update your collection to match?</p>}
      {trade.status === "completed" && trade.my_applied && <p className="muted trade-hint">Your collection is updated.</p>}
      {err ? (
        <p className="error trade-error" role="alert">
          {err.message}
        </p>
      ) : null}
      <footer className="trade-actions">
        {incomingOffer && (
          <>
            <button type="button" className="btn primary compact" disabled={busy} onClick={() => run.mutate(friendsApi.acceptTrade)}>
              Accept
            </button>
            <Link className="btn secondary compact" to={`/friends/${encodeURIComponent(trade.from_username)}?tab=spares&counter=${trade.id}`}>
              Counter
            </Link>
            <button type="button" className="ghost danger" disabled={busy} onClick={() => run.mutate(friendsApi.declineTrade)}>
              Decline
            </button>
          </>
        )}
        {outgoingOffer && (
          <button type="button" className="ghost danger" disabled={busy} onClick={() => run.mutate(friendsApi.cancelTrade)}>
            Cancel offer
          </button>
        )}
        {agreed && (
          <>
            <button type="button" className="btn primary compact" disabled={busy} onClick={() => run.mutate(friendsApi.completeTrade)}>
              We traded
            </button>
            <button type="button" className="ghost danger" disabled={busy} onClick={() => run.mutate(friendsApi.cancelTrade)}>
              Cancel trade
            </button>
          </>
        )}
        {toApply && (
          <button type="button" className="btn primary compact" disabled={busy} onClick={() => applyChange.mutate(friendsApi.applyTrade)}>
            Update my collection
          </button>
        )}
        {canUndo && (
          <button type="button" className="ghost" disabled={busy} onClick={() => applyChange.mutate(friendsApi.undoApplyTrade)}>
            Undo collection update
          </button>
        )}
      </footer>
    </article>
  );
}
