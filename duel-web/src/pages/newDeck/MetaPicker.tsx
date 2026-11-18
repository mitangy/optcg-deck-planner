import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { META_DEFAULT_DAYS, fetchMetaDecks, fetchMetaLeaders, formatDeckRow, type MetaDeck, type MetaLeader } from "../../decks/meta";
import { useAsyncResource } from "../../lib/useAsyncResource";
import { lookupCard } from "../../cards/atlas";
import { LeaderTile } from "./LeaderTile";

export type MetaChoice = { leader: { leaderId: string; name: string }; deck: MetaDeck };

const DECKS_SHOWN = 5;

function Unavailable() {
  return (
    <p className="meta nd-empty" role="status">
      Meta decks are not available right now.{" "}
      <Link className="linkish" to="/decks/meta">
        Browse meta decks
      </Link>
    </p>
  );
}

function DeckChoices({ leader, value, onChange }: { leader: MetaLeader; value: MetaChoice | null; onChange: (c: MetaChoice | null) => void }) {
  const res = useAsyncResource(() => fetchMetaDecks(leader.leader_id, META_DEFAULT_DAYS, false, undefined, DECKS_SHOWN), [leader.leader_id]);
  const decks = res.status === "ready" ? res.data.decks : null;
  const name = (res.status === "ready" && res.data.name) || leader.name;

  useEffect(() => {
    if (decks?.length && !decks.some((d: MetaDeck) => d.id === value?.deck.id)) {
      onChange({ leader: { leaderId: leader.leader_id, name }, deck: decks[0]! });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, leader.leader_id]);

  if (res.status === "loading") return <p className="meta nd-empty">Loading decklists…</p>;
  if (res.status === "error" || !decks?.length) return <Unavailable />;
  return (
    <fieldset className="nd-decks">
      <legend>{name} decklists</legend>
      {decks.map((d: MetaDeck) => (
        <label key={d.id} className="nd-deck">
          <input
            type="radio"
            name="nd-meta-deck"
            checked={value?.deck.id === d.id}
            onChange={() => onChange({ leader: { leaderId: leader.leader_id, name }, deck: d })}
          />
          <span>{formatDeckRow(d)}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function MetaPicker({ value, onChange }: { value: MetaChoice | null; onChange: (c: MetaChoice | null) => void }) {
  const res = useAsyncResource(() => fetchMetaLeaders(META_DEFAULT_DAYS), []);
  const [leaderId, setLeaderId] = useState<string | null>(null);

  if (res.status === "loading") return <p className="meta nd-empty">Loading meta decks…</p>;
  if (res.status === "error" || res.data.leaders.length === 0) return <Unavailable />;
  const picked = res.data.leaders.find((l) => l.leader_id === leaderId);
  return (
    <div className="nd-picker">
      <div className="nd-scroll">
        <ul className="nd-grid">
          {res.data.leaders.map((l) => (
            <LeaderTile
              key={l.leader_id}
              id={l.leader_id}
              name={l.name || lookupCard(l.leader_id).name}
              colors={lookupCard(l.leader_id).colors}
              selected={l.leader_id === leaderId}
              onPick={() => {
                setLeaderId(l.leader_id);
                onChange(null);
              }}
            />
          ))}
        </ul>
      </div>
      {picked ? (
        <DeckChoices key={picked.leader_id} leader={picked} value={value} onChange={onChange} />
      ) : (
        <p className="meta nd-empty">Pick a Leader to see its tournament decks.</p>
      )}
    </div>
  );
}
