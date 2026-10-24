import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { money } from "../api";
import { CardArtImg } from "../CardThumb";
import { FriendCollection } from "./FriendCollection";
import { FriendSpares } from "./FriendSpares";
import { TradeTray } from "./TradeTray";
import { friendsApi, type FriendProfile } from "./friendsApi";
import { counterPrefill, type TrayLine } from "./tradeLogic";
import { Empty, LoadError, Tabs } from "./ui";
import { useFriend } from "./useFriend";

type FriendTab = "decks" | "collection" | "spares";

function availableTabs(p: FriendProfile): FriendTab[] {
  return [p.decks_shared ? "decks" : null, p.collection_shared ? "collection" : null, p.trades_open ? "spares" : null].filter(Boolean) as FriendTab[];
}

function summaryLine(p: FriendProfile): string {
  const parts: string[] = [];
  if (p.deck_count != null) parts.push(`${p.deck_count} deck${p.deck_count === 1 ? "" : "s"}`);
  if (p.total_copies != null) parts.push(`${p.total_copies} cards (${p.unique_cards ?? 0} different)`);
  if (p.total_value != null) parts.push(money(p.total_value));
  if (p.spare_cards != null) parts.push(`${p.spare_cards} spare card${p.spare_cards === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function FriendPage() {
  const { username } = useParams();
  const { friend, isLoading: listLoading, error: listError } = useFriend(username);
  const profile = useQuery({
    queryKey: ["friend", friend?.user_id, "profile"],
    queryFn: () => friendsApi.profile(friend!.user_id),
    enabled: Boolean(friend),
    retry: false,
  });
  const [params, setParams] = useSearchParams();
  const counterId = Number(params.get("counter")) || null;
  const trades = useQuery({ queryKey: ["trades"], queryFn: friendsApi.trades, enabled: counterId != null });

  // The offer tray lives here so it survives switching tabs.
  const [lines, setLines] = useState<TrayLine[]>([]);
  const [message, setMessage] = useState("");
  const prefilled = useRef<number | null>(null);
  const counterTrade = useMemo(
    () => (counterId == null ? null : (trades.data?.incoming.find((t) => t.id === counterId && t.status === "pending") ?? null)),
    [counterId, trades.data],
  );
  useEffect(() => {
    if (!counterTrade || !friend || counterTrade.from_user_id !== friend.user_id || prefilled.current === counterTrade.id) return;
    prefilled.current = counterTrade.id;
    setLines(counterPrefill(counterTrade));
    setMessage("");
  }, [counterTrade, friend]);

  if (listLoading) return <p className="muted friends-loading">Loading…</p>;
  if (listError) return <LoadError error={listError} />;
  if (!friend || profile.isError) {
    return (
      <section className="friends-page">
        <Empty title="Not found">That person isn't on your friends list, or isn't sharing anything with you.</Empty>
        <p className="friend-back">
          <Link to="/friends">Back to Friends</Link>
        </p>
      </section>
    );
  }

  const p = profile.data;
  const tabs = p ? availableTabs(p) : [];
  const raw = params.get("tab");
  const tab: FriendTab | null = raw && (["decks", "collection", "spares"] as string[]).includes(raw) ? (raw as FriendTab) : (tabs[0] ?? null);
  const label: Record<FriendTab, string> = { decks: "Decks", collection: "Collection", spares: "Spares" };
  const setTab = (next: FriendTab) => {
    const q = new URLSearchParams(params);
    q.set("tab", next);
    setParams(q, { replace: true });
  };
  const trayOpen = lines.length > 0 || counterTrade != null;

  return (
    <section className={`friends-page friend-page${trayOpen ? " has-tray" : ""}`}>
      <p className="friend-back">
        <Link to="/friends">← Friends</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{friend.username}</h1>
          <p className="muted">{p ? summaryLine(p) || "Not sharing anything yet." : " "}</p>
        </div>
      </div>
      {!p ? (
        <p className="muted">Loading…</p>
      ) : tabs.length === 0 ? (
        <Empty title={`${friend.username} isn't sharing anything yet`}>Ask them to turn on sharing on their Friends page.</Empty>
      ) : (
        <>
          <Tabs label={`${friend.username}'s pages`} active={tab ?? tabs[0]!} onChange={setTab} tabs={tabs.map((k) => ({ key: k, label: label[k] }))} />
          {tab === "decks" && p.decks_shared && <FriendDecks friendId={friend.user_id} username={friend.username} />}
          {tab === "collection" && p.collection_shared && <FriendCollection friendId={friend.user_id} username={friend.username} />}
          {tab === "spares" && p.trades_open && <FriendSpares friendId={friend.user_id} username={friend.username} lines={lines} onLines={setLines} />}
          {tab && !tabs.includes(tab) && (
            <Empty title={`${friend.username} isn't sharing their ${tab === "spares" ? "spares" : tab}`}>It may be off, or they may have changed it.</Empty>
          )}
        </>
      )}
      <TradeTray
        friendId={friend.user_id}
        username={friend.username}
        lines={lines}
        onLines={setLines}
        message={message}
        onMessage={setMessage}
        counterId={counterTrade?.id ?? null}
        onClear={() => {
          setLines([]);
          setMessage("");
          if (counterId != null) {
            const q = new URLSearchParams(params);
            q.delete("counter");
            setParams(q, { replace: true });
          }
        }}
      />
    </section>
  );
}

function FriendDecks({ friendId, username }: { friendId: number; username: string }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["friend", friendId, "decks"], queryFn: () => friendsApi.decks(friendId) });
  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  if (data!.length === 0) return <Empty title="No decks to show">{username} hasn't shared any decks yet.</Empty>;
  return (
    <div className="deck-grid friend-deck-grid">
      {data!.map((d) => (
        <Link key={d.id} className="deck-card friend-deck-card" to={`/friends/${encodeURIComponent(username)}/decks/${d.id}`}>
          <div className="deck-card-main">
            <div className="deck-card-leader-art">
              <CardArtImg
                src={d.leader_image_url}
                cardId={d.leader_card_id}
                alt={d.leader_name || d.leader_card_id || "Leader"}
                className="deck-card-leader-thumb"
                loading="lazy"
                fallback={
                  <div className="thumb placeholder deck-card-leader-thumb" aria-label={d.leader_card_id || "Leader"}>
                    <span className="deck-card-leader-fallback">{d.leader_card_id || "?"}</span>
                  </div>
                }
              />
            </div>
            <div className="deck-card-body">
              <h2>{d.name}</h2>
              <p className="muted">{d.leader_name || d.leader_card_id || "No leader"}</p>
              <p className="muted">{d.main_cards}/51 main</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
