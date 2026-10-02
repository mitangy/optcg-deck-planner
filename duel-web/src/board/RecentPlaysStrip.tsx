import { useState } from "react";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { BattleLogEntry } from "./battleLog";
import { setPreviewCard } from "./cardPreview";
import { CardInspect } from "./CardInspect";
import { inspectOnContextMenu } from "./inspectGestures";
import { recentPlays, type RecentPlay } from "./recentPlays";

/** The last card uses by either player as a list (thumbnail, name, who and when), newest first (wide layouts). */
export function RecentPlaysStrip({
  entries,
  youSeat,
}: {
  entries: readonly BattleLogEntry[];
  youSeat: 0 | 1;
}) {
  const plays = recentPlays(entries, youSeat, undefined, (d) => lookupCard(d).name);
  const [inspect, setInspect] = useState<RecentPlay | null>(null);
  return (
    <section className="recent-plays" aria-label="Recent plays">
      <h3 className="recent-plays-heading">Recent plays</h3>
      {plays.length === 0 ? (
        <p className="recent-plays-empty">No cards played yet.</p>
      ) : (
        <ol className="recent-plays-row">
          {plays.map((p) => {
            const src = resolveCardImageUrl(p.defId, { ownerSeat: p.ownerSeat });
            return (
              <li key={p.entryId}>
                <button
                  type="button"
                  className={`recent-play ${p.mine ? "recent-play-you" : "recent-play-opp"}`}
                  aria-label={p.label}
                  title={p.label}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setPreviewCard({ defId: p.defId, ownerSeat: p.ownerSeat });
                  }}
                  onFocus={() => setPreviewCard({ defId: p.defId, ownerSeat: p.ownerSeat })}
                  onClick={() => setPreviewCard({ defId: p.defId, ownerSeat: p.ownerSeat })}
                  onContextMenu={(e) => inspectOnContextMenu(e, () => setInspect(p))}
                >
                  <span className="recent-play-thumb" aria-hidden>
                    {src ? <img src={src} alt="" draggable={false} /> : p.defId}
                  </span>
                  <span className="recent-play-text">
                    <span className="recent-play-name">{lookupCard(p.defId).name}</span>
                    <span className="recent-play-meta">
                      <span className="recent-play-who">{p.who}</span> {p.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {inspect ? (
        <CardInspect
          defId={inspect.defId}
          open
          onClose={() => setInspect(null)}
          ownerSeat={inspect.ownerSeat}
        />
      ) : null}
    </section>
  );
}
