import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { money } from "../api";
import { friendsApi, type MySpareItem } from "./friendsApi";
import { CardRow, Empty, LoadError, QtyStepper } from "./ui";
import { useSharing } from "./SharingCard";

/** Cards you own beyond what your decks and Shopping list need. Keep holds some back from trades. */
export function MySparesPanel() {
  const qc = useQueryClient();
  const sharing = useSharing();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["my-spares"], queryFn: friendsApi.mySpares });
  const keep = useMutation({
    mutationFn: (v: { item: MySpareItem; qty: number }) => friendsApi.setKeep(v.item.card_id, v.qty),
    onSuccess: (res) => {
      qc.setQueryData<{ items: MySpareItem[] }>(["my-spares"], (old) =>
        old
          ? {
              items: old.items
                .map((i) => (i.card_id === res.card_id ? { ...i, keep_qty: res.keep_qty, spare: res.spare } : i))
                .filter((i) => i.spare > 0 || i.keep_qty > 0),
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: ["my-spares"] });
    },
  });
  const openTrades = useMutation({
    mutationFn: () => friendsApi.setSharing({ trades_open: true }),
    onSuccess: (next) => qc.setQueryData(["sharing"], next),
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  const items = data!.items;

  return (
    <section className="my-spares" aria-label="My spares">
      {sharing.data && !sharing.data.trades_open && (
        <p className="friend-note">
          Friends can't see these yet.{" "}
          <button type="button" className="ghost linkish" disabled={openTrades.isPending} onClick={() => openTrades.mutate()}>
            Open to trades
          </button>
        </p>
      )}
      <p className="muted friend-lede">Spares are copies you own beyond what your decks and Shopping list need. Keep some back and friends won't be offered them.</p>
      {keep.isError && <p className="error">{(keep.error as Error).message}</p>}
      {items.length === 0 ? (
        <Empty title="No spares">Once you own more copies than your decks need, they show up here.</Empty>
      ) : (
        <ul className="friend-card-list">
          {items.map((item) => (
            <CardRow
              key={item.card_id}
              cardId={item.card_id}
              name={item.name}
              imageUrl={item.image_url}
              meta={
                <>
                  {item.spare} spare{item.market_price != null ? ` · ${money(item.market_price)} each` : ""}
                </>
              }
            >
              <span className="keep-control">
                <span className="keep-label">Keep</span>
                <QtyStepper
                  value={item.keep_qty}
                  max={Math.min(99, item.keep_qty + item.spare)}
                  label={`kept ${item.card_id}`}
                  onChange={(qty) => keep.mutate({ item, qty })}
                />
              </span>
            </CardRow>
          ))}
        </ul>
      )}
    </section>
  );
}
