import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminFeedback, type AdminFeedback, type FeedbackItem, type FeedbackRating } from "./adminApi";
import { Tile } from "./charts";
import { RATING_LABEL, feedbackMatchPath } from "./adminLogic";

const PAGE = 20;
const FILTERS: readonly { id: FeedbackRating | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "wrong", label: "Wrong" },
  { id: "down", label: "Not helpful" },
  { id: "up", label: "Good" },
];

function when(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "";
}

function Row({ item }: { item: FeedbackItem }) {
  const game = feedbackMatchPath(item);
  return (
    <li className="adm-fb-item" data-rating={item.rating}>
      <div className="adm-fb-head">
        <span className="adm-fb-badge" data-rating={item.rating}>
          {RATING_LABEL[item.rating]}
        </span>
        <span className="adm-fb-who">{item.user_name ?? "Player"}</span>
        <span className="adm-fb-meta">
          {item.kind === "review" ? "Match review" : "Chat answer"}
          {item.model ? ` · ${item.model}` : ""} · {when(item.updated_at)}
        </span>
        {game ? (
          <Link className="adm-fb-link" to={game}>
            Open game
          </Link>
        ) : null}
      </div>
      {item.note ? <p className="adm-fb-note">{item.note}</p> : null}
      {item.question ? <p className="adm-fb-question">Asked: {item.question}</p> : null}
      <div className="adm-fb-excerpt" tabIndex={0} role="region" aria-label="What Log Pose said">
        {item.answer_excerpt || "(no text stored)"}
      </div>
    </li>
  );
}

/** What players rated Log Pose answers: counts for the last 30 days and the newest ratings first. Admin only (the endpoint refuses anyone else). */
export function FeedbackSection() {
  const [filter, setFilter] = useState<FeedbackRating | null>(null);
  const [data, setData] = useState<AdminFeedback | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback((rating: FeedbackRating | null, offset: number) => {
    const mine = ++seq.current;
    setState("loading");
    fetchAdminFeedback(rating, PAGE, offset)
      .then((d) => {
        if (mine !== seq.current) return;
        setData(d);
        setItems((cur) => (offset ? [...cur, ...d.items] : d.items));
        setMore(d.items.length === PAGE);
        setState("ready");
      })
      .catch((e: Error) => {
        if (mine !== seq.current) return;
        setError(e.message);
        setState("error");
      });
  }, []);

  useEffect(() => load(filter, 0), [filter, load]);

  const counts = data?.counts;
  const days = data?.days ?? 30;
  return (
    <section className="panel adm-fb" aria-label="Log Pose feedback">
      <h2 className="panel-title">Log Pose feedback</h2>
      <div className="adm-tiles adm-fb-tiles" aria-label={`Ratings, last ${days} days`}>
        <Tile label="Good" value={counts ? counts.up : "—"} sub={`last ${days} days`} />
        <Tile label="Not helpful" value={counts ? counts.down : "—"} sub={`last ${days} days`} />
        <Tile label="Wrong" value={counts ? counts.wrong : "—"} sub={`last ${days} days`} />
      </div>
      <div className="adm-fb-filters" role="group" aria-label="Show ratings">
        {FILTERS.map((f) => (
          <button key={f.label} type="button" className="adm-fb-filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="adm-fb-list" aria-busy={state === "loading"}>
        {state === "error" ? (
          <p className="panel-copy adm-error" role="alert">
            Could not load feedback: {error}
          </p>
        ) : null}
        {state === "ready" && items.length === 0 ? <p className="panel-copy adm-muted">No ratings yet.</p> : null}
        {state === "loading" && items.length === 0 ? (
          <p className="panel-copy adm-muted" role="status">
            Loading…
          </p>
        ) : null}
        {items.length ? (
          <ul className="adm-fb-items">
            {items.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        ) : null}
        {more ? (
          <button type="button" className="btn btn-secondary btn-sm adm-more" disabled={state === "loading"} onClick={() => load(filter, items.length)}>
            Show more
          </button>
        ) : null}
      </div>
    </section>
  );
}
