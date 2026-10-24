import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { money } from "../api";
import { CardLayoutToggle, useCardLayout } from "../CardLayout";
import { CardThumb } from "../CardThumb";
import { CardSearchInput, COLOR_ORDER, matchesCardSearch } from "../cardListControls";
import { friendsApi, type FriendOwnedItem } from "./friendsApi";
import { CardRow, Empty, LoadError } from "./ui";

type SortKey = "name" | "owned" | "price" | "value";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "owned", label: "Most owned" },
  { key: "price", label: "Price" },
  { key: "value", label: "Value" },
];

function sortCollection(items: FriendOwnedItem[], key: SortKey): FriendOwnedItem[] {
  const num = (n: number | null) => n ?? -1;
  const out = [...items];
  out.sort((a, b) => {
    if (key === "owned") return b.owned + b.alts_owned - (a.owned + a.alts_owned) || a.name.localeCompare(b.name);
    if (key === "price") return num(b.market_price) - num(a.market_price) || a.name.localeCompare(b.name);
    if (key === "value") return num(b.value) - num(a.value) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name) || a.card_id.localeCompare(b.card_id);
  });
  return out;
}

/** The cards a friend owns: read only, no buying. */
export function FriendCollection({ friendId, username }: { friendId: number; username: string }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["friend", friendId, "collection"], queryFn: () => friendsApi.collection(friendId) });
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const showValue = data?.total_value != null;
  const sortOptions = SORTS.filter((s) => s.key !== "value" || showValue);
  const items = useMemo(() => {
    const list = (data?.items ?? []).filter((i) => (!color || i.color.split(/[/ ]/).includes(color)) && matchesCardSearch(i, search));
    return sortCollection(list, sort);
  }, [data, search, color, sort]);

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  if (data!.items.length === 0) return <Empty title="No cards yet">{username} hasn't added any cards to their collection.</Empty>;

  return (
    <section aria-label={`${username}'s collection`}>
      <div className="friend-toolbar">
        <CardSearchInput value={search} onChange={setSearch} />
        <select aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">All colors</option>
          {COLOR_ORDER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {sortOptions.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <CardLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      {items.length === 0 ? (
        <Empty title="No matches">Try a different search or color.</Empty>
      ) : layout === "grid" ? (
        <div className="card-grid friend-card-grid">
          {items.map((item) => (
            <article key={item.card_id} className="grid-card friend-grid-card" data-card-id={item.card_id}>
              <div className="grid-card-media">
                <CardThumb src={item.image_url || undefined} cardId={item.card_id} alt={item.name} />
              </div>
              <div className="grid-card-body">
                <div className="card-id">{item.card_id}</div>
                <div className="grid-card-name">{item.name}</div>
                <div className="grid-card-meta muted">{ownedText(item)}</div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ul className="friend-card-list">
          {items.map((item) => (
            <CardRow key={item.card_id} cardId={item.card_id} name={item.name} imageUrl={item.image_url} meta={[item.rarity, item.market_price != null ? money(item.market_price) : null].filter(Boolean).join(" · ")}>
              <span className="friend-owned-text">{ownedText(item)}</span>
            </CardRow>
          ))}
        </ul>
      )}
    </section>
  );
}

function ownedText(item: FriendOwnedItem): string {
  const total = item.owned + item.alts_owned;
  return [`Owns ${total}`, item.spare > 0 ? `${item.spare} spare` : "", item.value != null ? money(item.value) : ""].filter(Boolean).join(" · ");
}
