import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { historySummary } from "./historySummary";
import { matchRow, outcomeKey } from "./matchRow";
import { LeaderPair } from "./LeaderPair";
import type { MatchHistoryEntry } from "./historyApi";
import "./history.css";

const cardName = (id: string) => lookupCard(id).name || id;

function ChatMark() {
  return (
    <span className="history-chat" role="img" aria-label="Has a Log Pose chat" title="You have a Log Pose chat about this game">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.5 14.2 12h-4.4zM12 17.5 9.8 12h4.4z" />
      </svg>
      <span aria-hidden>Chat</span>
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
            <LeaderPair yours={r.yourLeaderId} theirs={r.opponentLeaderId} />
            <p className="history-leaders" title={`${r.yourLeader} vs ${r.opponentLeader}`}>
              <span>{r.yourLeader}</span>
              <span className="history-vs">vs</span>
              <span>{r.opponentLeader}</span>
            </p>
            <p className="history-opp" title={r.opponent}>
              {r.opponent}
            </p>
            <p className="history-how">
              <span className="history-how-text">{[r.how, r.turns, r.when].filter(Boolean).join(" · ")}</span>
              {r.hasChat ? <ChatMark /> : null}
            </p>
            <span className="history-tag" data-mode={r.mode.toLowerCase()}>
              {r.mode}
            </span>
            {r.bountyDelta ? <span className="history-bounty" title="Bounty change">{r.bountyDelta}</span> : <span className="history-bounty" />}
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
  const { ranked, casual, streak, recent } = summary;
  return (
    <section className="history-summary" aria-label={`Your record over the last ${summary.games} games`}>
      <h2 className="history-summary-title">Last {summary.games} {summary.games === 1 ? "game" : "games"}</h2>
      <dl className="history-summary-grid">
        <div>
          <dt>Record</dt>
          <dd>
            {summary.wins}-{summary.losses}
            <span className="history-summary-sub">{summary.winPct}% won</span>
          </dd>
        </div>
        <div>
          <dt>Ranked</dt>
          <dd>
            {ranked.wins}-{ranked.losses}
          </dd>
        </div>
        <div>
          <dt>Casual</dt>
          <dd>
            {casual.wins}-{casual.losses}
          </dd>
        </div>
        {streak ? (
          <div>
            <dt>Streak</dt>
            <dd data-streak={streak.kind}>
              {streak.kind}
              {streak.count}
            </dd>
          </div>
        ) : null}
        {summary.rating != null ? (
          <div>
            <dt>Bounty</dt>
            <dd>{summary.rating}</dd>
          </div>
        ) : null}
      </dl>
      <ol className="history-dots" aria-label={`Last ${recent.length} results, oldest first: ${[...recent].reverse().join(", ")}`}>
        {[...recent].reverse().map((r, i) => (
          <li key={i} className="history-dot" data-result={r} aria-hidden>
            {r}
          </li>
        ))}
      </ol>
    </section>
  );
}

const SKELETON_ROWS = 3;

/** Placeholder rows shaped like real ones, so the list doesn't jump when games arrive (#1388). */
export function MatchHistorySkeleton() {
  return (
    <div aria-busy="true">
      <p className="visually-hidden" role="status">Loading your matches</p>
      <ol className="history-list" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li key={i} className="history-item">
            <div className="history-row history-row-link history-skeleton">
              <span className="history-outcome history-skel">&nbsp;</span>
              <span className="history-pair">
                <span className="history-leader-art history-leader-art-empty" />
                <span className="history-leader-art history-leader-art-empty" />
              </span>
              <span className="history-leaders history-skel">&nbsp;</span>
              <span className="history-opp history-skel">&nbsp;</span>
              <span className="history-how history-skel">&nbsp;</span>
              <span className="history-tag history-skel">&nbsp;</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
