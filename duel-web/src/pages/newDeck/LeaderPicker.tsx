import { useMemo, useState } from "react";
import { listAtlasLeaders, lookupCard } from "../../cards/atlas";
import { colorFill } from "../../board/preview/PreviewBadges";
import { LEADER_COLORS, filterLeaders, type PickableLeader } from "../../decks/newDeckStart";
import { LeaderTile } from "./LeaderTile";

export function LeaderPicker({ value, onChange }: { value: string | null; onChange: (leader: PickableLeader) => void }) {
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const all = useMemo<PickableLeader[]>(
    () =>
      listAtlasLeaders()
        .map((id) => lookupCard(id))
        .map((e) => ({ id: e.id, name: e.name, colors: e.colors }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)),
    [],
  );
  const shown = useMemo(() => filterLeaders(all, query, colors), [all, query, colors]);

  function toggle(c: string) {
    setColors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  return (
    <div className="nd-picker">
      <div className="nd-filters">
        <input
          type="search"
          className="nd-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Leaders"
          aria-label="Search Leaders"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="nd-chips" role="group" aria-label="Filter by colour">
          {LEADER_COLORS.map((c) => (
            <button key={c} type="button" className="nd-chip" aria-pressed={colors.includes(c)} onClick={() => toggle(c)}>
              <i style={{ background: colorFill([c]) }} aria-hidden />
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="nd-scroll">
        {shown.length === 0 ? (
          <p className="meta nd-empty" role="status">
            No Leaders match.
          </p>
        ) : (
          <ul className="nd-grid">
            {shown.map((l) => (
              <LeaderTile key={l.id} id={l.id} name={l.name} colors={l.colors} selected={l.id === value} onPick={() => onChange(l)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
