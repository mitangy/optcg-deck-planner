import { DiscordLink } from "../app/DiscordLink";
import { Topbar } from "../app/Topbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, money } from "../api";
import { DUEL_URL } from "../app/duelLink";
import { UpdateNotice } from "../app/UpdateNotice";
import { useMe } from "../auth/useMe";
import { CardLayoutToggle, useCardLayout } from "../ui/CardLayout";
import {
  buildFilterSummary,
  CardSearchInput,
  CollapsibleFilters,
  compareCardOrder,
  matchesCardSearch,
  SortMenu,
  useCardSorts,
  usePersistedOpen,
  type SortKey,
} from "../ui/cardListControls";
import { BuildTag } from "@optcg/ui/appShell";
import { DeckStatsDock } from "./decks/DeckStats";
import { ThemeToggle } from "../ui/ThemeToggle";
import { CardThumb } from "../ui/CardThumb";
import { GridCard, MobileCard } from "../ui/PlannerCard";
import { MarketPrice } from "../cards/MarketPrice";
import { StillNeededCell, stillNeededText, totalOwned } from "./collection/OwnedCells";
import { SortableTh, sortByColumn, useColumnSort } from "../ui/columnSort";
import { ShoppingListSkeleton } from "../ui/Skeleton";
import { isDonCardType } from "../cards/donCards";
import { shoppingColumnValue, sharedUsedIn } from "./shopping/ShoppingItemsView";
import { formatShoppingListStats } from "./shopping/shoppingStats";
import { COLSORT_SHARE_KEY, SHARE_ONLY_NEED_KEY } from "../storage/keys";
import { qk } from "../cache/queryKeys";

export function PublicSharePage() {
  const { token = "" } = useParams();
  const [onlyNeed, setOnlyNeed] = usePersistedOpen(SHARE_ONLY_NEED_KEY, true);
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useCardLayout();
  // A share link carries no per-deck or per-member order, so those two sorts are off.
  const unavailableSorts = useMemo(() => ["deck", "user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, unavailableSorts);
  const meQ = useMe();
  const me = meQ.data ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Owned counts on a deck link come from whoever is viewing, so the viewer is part of the key.
  const { data, isLoading, error } = useQuery({
    queryKey: qk.share.public(token, me?.id ?? null),
    queryFn: () => api.publicShare(token),
    enabled: Boolean(token) && !meQ.isLoading,
  });
  const loginHref = `/login?next=${encodeURIComponent(`/share/${token}`)}`;
  const copyDeck = useMutation({
    mutationFn: () => api.copySharedDeck(token),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.decks() });
      void qc.invalidateQueries({ queryKey: qk.shopping.all() });
      navigate(`/decks/${created.id}`);
    },
  });

  const shareStatsCards = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => !isDonCardType(i.card_type))
        .map((i) => ({ id: i.card_id, copies: i.need })),
    [data],
  );

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter((i) => i.still_need > 0);
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder(a, b, effectiveSorts));
    return list;
  }, [data, onlyNeed, search, effectiveSorts]);
  const { sort, onSort } = useColumnSort(COLSORT_SHARE_KEY);
  const tableItems = useMemo(() => sortByColumn(items, sort, shoppingColumnValue), [items, sort]);

  return (
    <div className="app public-app">
      <UpdateNotice />
      <Topbar brandTo="/login">
        <BuildTag />
        <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
          Play Duel
        </a>
        <DiscordLink />
        <ThemeToggle />
        {me ? (
          <Link className="btn secondary" to="/">
            My decks
          </Link>
        ) : (
          <Link className="btn secondary" to={loginHref}>
            Sign in
          </Link>
        )}
      </Topbar>
      <main className="app-main">
        {(isLoading || meQ.isLoading) && <ShoppingListSkeleton />}
        {error && <p className="error">{(error as Error).message}</p>}
        {data && (
          <div className={data.kind === "deck" ? "deck-layout" : undefined}>
          <section className="deck-main">
            <div className="page-head share-head">
              <div>
                <p className="eyebrow">Public {data.kind === "deck" ? "deck" : "shopping"} list</p>
                <h1>{data.deck_name || `${data.owner_name}'s list`}</h1>
                <p className="muted">
                  {data.kind !== "deck"
                    ? `Shared by ${data.owner_name} · ${formatShoppingListStats(data)}`
                    : me
                      ? `Shared by ${data.owner_name} · Owned counts are from your collection · ${formatShoppingListStats(data)}`
                      : `Shared by ${data.owner_name} · ${formatShoppingListStats(data)} · Sign in to see which of these cards you own.`}
                </p>
              </div>
              {data.kind === "deck" && (
                <div className="page-head-actions">
                  {me ? (
                    <button
                      type="button"
                      className="btn primary share-copy-btn"
                      disabled={copyDeck.isPending}
                      onClick={() => copyDeck.mutate()}
                    >
                      {copyDeck.isPending ? "Adding…" : "Add to my decks"}
                    </button>
                  ) : (
                    <Link className="btn primary share-copy-btn" to={loginHref}>
                      Sign in to add
                    </Link>
                  )}
                </div>
              )}
            </div>
            {copyDeck.error && <p className="error">{(copyDeck.error as Error).message}</p>}

            <div className="list-toolbar">
              <div className="list-toolbar-row">
                <CardSearchInput value={search} onChange={setSearch} />
                <CardLayoutToggle layout={layout} onChange={setLayout} />
              </div>
              <CollapsibleFilters summary={buildFilterSummary({ onlyNeed, sorts: effectiveSorts, layout })}>
                <div className="filters">
                  <SortMenu
                    sorts={sorts}
                    onChange={setSorts}
                    onlyNeed={onlyNeed}
                    unavailableKeys={unavailableSorts}
                    columnSortKey={COLSORT_SHARE_KEY}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={onlyNeed}
                      onChange={(e) => setOnlyNeed(e.target.checked)}
                    />
                    Still need only
                  </label>
                </div>
              </CollapsibleFilters>
            </div>

            {layout === "grid" ? (
              <div className="card-grid">
                {items.map((item) => (
                  <GridCard
                    key={item.card_id}
                    className={item.still_need > 0 ? "need" : "done"}
                    cardId={item.card_id}
                    name={item.name}
                    imageSrc={item.image_url || undefined}
                    meta={
                      <>
                        Owned {totalOwned(item.owned, item.alts_owned)} · {stillNeededText(item.still_need, item.need)}
                        {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                      </>
                    }
                  >
                    <div className="grid-card-price">
                      <MarketPrice price={item.market_price} productId={item.product_id} />
                    </div>
                    {item.tcgplayer_url && (
                      <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    )}
                  </GridCard>
                ))}
              </div>
            ) : (
              <>
                <div className="table-wrap desktop-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
                        <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
                        <SortableTh label="Still needed" colKey="still" firstDir="desc" sort={sort} onSort={onSort} />
                        <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
                        <SortableTh label="Remaining" colKey="remaining" firstDir="desc" sort={sort} onSort={onSort} />
                        <SortableTh label="Used in" colKey="used" firstDir="asc" sort={sort} onSort={onSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {tableItems.map((item) => (
                        <tr key={item.card_id} className={item.still_need > 0 ? "need" : "done"}>
                          <td className="card-cell">
                            <div className="card-cell-inner">
                              <CardThumb src={item.image_url || undefined} cardId={item.card_id} alt={item.name} />
                              <div>
                                <div className="card-id">{item.card_id}</div>
                                <div>{item.name}</div>
                                {item.tcgplayer_url && (
                                  <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                                    TCGPlayer
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{totalOwned(item.owned, item.alts_owned)}</td>
                          <td>
                            <StillNeededCell still={item.still_need} need={item.need} />
                          </td>
                          <td>
                            <MarketPrice price={item.market_price} productId={item.product_id} />
                          </td>
                          <td>{money(item.remaining_cost)}</td>
                          <td className="used-in">
                            {sharedUsedIn(item)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-card-list">
                  {items.map((item) => (
                    <MobileCard
                      key={item.card_id}
                      className={item.still_need > 0 ? "need" : "done"}
                      cardId={item.card_id}
                      name={item.name}
                      imageSrc={item.image_url || undefined}
                      cost={item.cost}
                      rarity={item.rarity}
                      meta={
                        <>
                          {[`Owned ${totalOwned(item.owned, item.alts_owned)}`, stillNeededText(item.still_need, item.need)]
                            .filter(Boolean)
                            .join(" · ")}
                          {item.still_need > 0 ? ` · Left ${money(item.remaining_cost)}` : ""}
                        </>
                      }
                      info={
                        <div className="mobile-card-price-row">
                          <div className="mobile-card-price-main">
                            <span className="muted">Market</span>
                            <MarketPrice price={item.market_price} productId={item.product_id} />
                            {item.tcgplayer_url ? (
                              <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                                TCGPlayer
                              </a>
                            ) : null}
                          </div>
                        </div>
                      }
                    >
                      {sharedUsedIn(item) && <p className="used-in mobile-used-in">{sharedUsedIn(item)}</p>}
                    </MobileCard>
                  ))}
                </div>
              </>
            )}
          </section>
          {data.kind === "deck" && (
            <DeckStatsDock cards={shareStatsCards} leaderId={data.items[0]?.primary_leader_card_id ?? null} />
          )}
          </div>
        )}
      </main>
    </div>
  );
}
