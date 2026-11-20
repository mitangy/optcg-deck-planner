import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { useArtFallback } from "../cards/useArtFallback";
import { historySummary } from "./historySummary";
import { matchRow, outcomeKey } from "./matchRow";
import type { MatchHistoryEntry } from "./historyApi";
import "./history.css";

const cardName = (id: string) => lookupCard(id).name || id;

function LeaderArt({ defId }: { defId: string | null }) {
  const { src, fail } = useArtFallback(defId ? resolveCardImageUrl(defId, { size: "thumb" }) : null, defId);
  return src ? (
    <img className="history-leader-art" src={src} alt="" loading="lazy" onError={fail} />
  ) : (
    <span className="history-leader-art history-leader-art-empty" aria-hidden />
  );
}

function ChatMark() {
  return (
    <span className="history-chat" role="img" aria-label="Has a Log Pose chat" title="You have a Log Pose chat about this game">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.5 14.2 12h-4.4zM12 17.5 9.8 12h4.4z" />
      </svg>
    </span>
  );
}

export function MatchHistoryList({ matches, limit }: { matches: readonly MatchHistoryEntry[]; limit?: number }) {
  const shown = limit != null ? matches.slice(0, limit) : matches;
  const rows = shown.map((m) => matchRow(m, cardName));
  const anyReplay = rows.some((r) => r.replay);
  if (rows.length === 0) return null;
  return (
    <ol className="history-list">
      {rows.map((r) => (
        <li key={r.id} className="history-item">
          <Link
            to={`/history/${encodeURIComponent(r.id)}`}
            className="history-row history-row-link"
            data-outcome={outcomeKey(r.outcome)}
          >
            <span className="history-outcome">{r.outcome}</span>
            <LeaderArt defId={r.yourLeaderId} />
            <div className="history-main">
              <p className="history-leaders">
                <span>{r.yourLeader}</span>
                <span className="history-vs">vs</span>
                <span>{r.opponentLeader}</span>
                {r.hasChat ? <ChatMark /> : null}
              </p>
              <p className="history-meta">
                {[r.opponent, r.how, r.turns, r.when].filter(Boolean).join(" · ")}
              </p>
            </div>
            {r.bountyDelta ? <span className="history-bounty" title="Bounty change">{r.bountyDelta}</span> : null}
            <span className="history-chevron" aria-hidden>›</span>
          </Link>
          {r.replay ? (
            <Link
              className="history-replay-btn"
              to={`/replay/${encodeURIComponent(r.id)}`}
              aria-label={`Watch replay: ${r.yourLeader} vs ${r.opponentLeader}, ${r.opponent}`}
              title="Watch this game again"
            >
              <span aria-hidden>▶</span>
              <span className="history-replay-label">Watch</span>
            </Link>
          ) : anyReplay ? (
            <span className="history-replay-slot" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function RecordSummary({ matches }: { matches: readonly MatchHistoryEntry[] }) {
  const summary = historySummary(matches);
  if (!summary) return null;
  return (
    <dl className="history-summary" aria-label="Your record">
      <div>
        <dt>Record</dt>
        <dd>
          {summary.wins}-{summary.losses}
        </dd>
      </div>
      {summary.rating != null ? (
        <div>
          <dt>Bounty</dt>
          <dd>{summary.rating}</dd>
        </div>
      ) : null}
    </dl>
  );
}
