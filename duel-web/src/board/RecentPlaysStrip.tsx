import { useState } from "react";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { BattleLogEntry } from "./battleLog";
import { setPreviewCard } from "./cardPreview";
import { CardInspect } from "./CardInspect";
import { inspectOnContextMenu } from "./inspectGestures";
import { recentPlays, type RecentPlay } from "./recentPlays";

/** Hearthstone-style row of the last card uses, newest first (wide layouts). */
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
                  {src ? <img src={src} alt="" draggable={false} /> : <span aria-hidden>{p.defId}</span>}
                  <span className="recent-play-mark" aria-hidden>
                    {p.mine ? "Y" : "O"}
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
