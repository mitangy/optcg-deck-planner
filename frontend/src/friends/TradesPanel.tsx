import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../api";
import { CardThumb } from "../ui/CardThumb";
import { invalidateOwnedViews } from "../pages/collection/ownedCollection";
import { UndoToast } from "../pages/collection/CollectorLine";
import { friendsApi, type Trade, type TradeLine } from "./friendsApi";
import { otherUsername, tradeSections, tradeSides, tradeStatusLabel, tradeStatusTone, UNDO_MS } from "./tradeLogic";
import { useUndoableAction } from "./useUndoableAction";
import { dateLabel, Empty, LoadError } from "./ui";
import { qk } from "../cache/queryKeys";

export function TradesPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.trades(), queryFn: friendsApi.trades });
  const { pending, schedule, undo } = useUndoableAction();
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const setHide = (id: number, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const defer = (trade: Trade, message: string, api: (id: number) => Promise<Trade>) => {
    setFailure(null);
    setHide(trade.id, true);
    schedule(trade.id, message, () => {
      void api(trade.id)
        .catch((e: unknown) => setFailure((e as Error).message || "That didn't go through."))
        .then(() => Promise.all([qc.invalidateQueries({ queryKey: qk.trades() }), qc.invalidateQueries({ queryKey: qk.tradesSummary() })]))
        .finally(() => setHide(trade.id, false));
    });
  };
  const onUndo = () => {
    if (pending) setHide(pending.id, false);
    undo();
  };
  const dismissToast = useCallback(() => undefined, []);
  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  const sections = tradeSections(data!)
    .map((s) => ({ ...s, trades: s.trades.filter((t) => !hidden.has(t.id)) }))
    .filter((s) => s.trades.length > 0);
  if (sections.length === 0 && hidden.size === 0 && !failure) {
    return (
      <Empty title="No trades yet">Open a friend's page and pick their Spares tab to offer a trade. Offers you send and get show up here.</Empty>
    );
  }
  return (
    <div className="trades-panel">
      {failure ? (
        <p className="error trade-error" role="alert">
          {failure}
        </p>
      ) : null}
      {sections.map((s) => (
        <TradeSection key={s.key} title={s.title} trades={s.trades} onDefer={defer} />
      ))}
      {pending ? <UndoToast key={pending.id} message={pending.message} ms={UNDO_MS} onAction={onUndo} onDismiss={dismissToast} /> : null}
    </div>
  );
}

type Defer = (trade: Trade, message: string, api: (id: number) => Promise<Trade>) => void;

function TradeSection({ title, trades, onDefer }: { title: string; trades: Trade[]; onDefer: Defer }) {
  if (trades.length === 0) return null;
  return (
    <section className="trade-section" aria-label={title}>
      <h2>
        {title} <span className="muted">{trades.length}</span>
      </h2>
      <ul className="trade-list">
        {trades.map((t) => (
          <li key={t.id}>
            <TradeCard trade={t} onDefer={onDefer} />
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

function TradeCard({ trade, onDefer }: { trade: Trade; onDefer: Defer }) {
  const qc = useQueryClient();
  const other = otherUsername(trade);
  const { iGive, iGet, iGiveValue, iGetValue } = tradeSides(trade);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.trades() });
    void qc.invalidateQueries({ queryKey: qk.tradesSummary() });
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
      void qc.invalidateQueries({ queryKey: qk.decks() });
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
        <span className={`trade-status status-${trade.status} tone-${tradeStatusTone(trade)}`}>{tradeStatusLabel(trade)}</span>
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
            <button type="button" className="ghost danger" disabled={busy} onClick={() => onDefer(trade, `Declined offer from ${other}`, friendsApi.declineTrade)}>
              Decline
            </button>
          </>
        )}
        {outgoingOffer && (
          <button type="button" className="ghost danger" disabled={busy} onClick={() => onDefer(trade, `Cancelled your offer to ${other}`, friendsApi.cancelTrade)}>
            Cancel offer
          </button>
        )}
        {agreed && (
          <>
            <button type="button" className="btn primary compact" disabled={busy} onClick={() => run.mutate(friendsApi.completeTrade)}>
              We traded
            </button>
            <button type="button" className="ghost danger" disabled={busy} onClick={() => onDefer(trade, `Cancelled trade with ${other}`, friendsApi.cancelTrade)}>
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
