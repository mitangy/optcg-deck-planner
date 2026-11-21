import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@optcg/ui/clipboard";
import { Select } from "@optcg/ui/popups";
import {
  TOPICS,
  TOPIC_LABELS,
  formatMonth,
  groupByDate,
  groupCountThrough,
  initialGroupCount,
  matchesQuery,
  monthKey,
  noteAnchor,
  noteKey,
  noteTopics,
  notesFor,
  olderGroupCount,
  type AppName,
} from "./helpers";
import { loadUnseen, markAllSeen } from "./lastSeen";
import { usePatchNotes } from "./loadNotes";
import { NoteCards } from "./NoteCards";
import type { PatchNote, Topic } from "./types";

const DAY = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

// Dates are UTC days, so the label never depends on the viewer's timezone.
export function formatNoteDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : DAY.format(d);
}

/** Notes longer than this fold to three lines with a More button. */
export const LONG_NOTE_CHARS = 260;

type TopicFilter = Topic | "all";

function readUrl(): { topic: TopicFilter; query: string; hash: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topic");
    return {
      topic: t && (TOPICS as readonly string[]).includes(t) ? (t as Topic) : "all",
      query: params.get("q") ?? "",
      hash: decodeURIComponent(window.location.hash.replace(/^#/, "")),
    };
  } catch {
    return { topic: "all", query: "", hash: "" };
  }
}

// replaceState keeps the router's own history.state, so no router is needed here.
function writeUrl(topic: TopicFilter, query: string): void {
  try {
    const params = new URLSearchParams(window.location.search);
    if (topic === "all") params.delete("topic");
    else params.set("topic", topic);
    if (query.trim()) params.set("q", query);
    else params.delete("q");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  } catch {
    // Sandboxed frames: the filter still works, it just is not in the address.
  }
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

function NoteItem({
  note,
  isNew,
  isTarget,
  expandedByDefault,
  cardHref,
}: {
  note: PatchNote;
  isNew: boolean;
  isTarget: boolean;
  expandedByDefault: boolean;
  cardHref?: (id: string) => string;
}) {
  const anchor = noteAnchor(note);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const long = note.text.length > LONG_NOTE_CHARS;
  const forced = isTarget || expandedByDefault;
  const expanded = !long || forced || open;
  const copy = async () => {
    const ok = await copyText(`${window.location.origin}${window.location.pathname}#${anchor}`);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  return (
    <li id={anchor} className={`wn-note${isNew ? " wn-note-new" : ""}${isTarget ? " wn-note-target" : ""}`}>
      <div className="wn-head">
        <h3 className="wn-title">
          <span>{note.title}</span>
          {isNew ? <span className="wn-new">New</span> : null}
          {note.app === "both" ? <span className="wn-tag">Duel + Planner</span> : null}
        </h3>
        <span className="wn-copied" role="status">
          {copied ? "Link copied" : ""}
        </span>
        <button type="button" className="wn-copy" aria-label={`Copy link to ${note.title}`} onClick={copy}>
          <LinkIcon />
        </button>
      </div>
      <p className={`wn-text${long && !expanded ? " wn-text-clamped" : ""}`}>{note.text}</p>
      {long && !forced ? (
        <button type="button" className="wn-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Less" : "More"}
        </button>
      ) : null}
      {note.cards?.length ? <NoteCards cards={note.cards} cardHref={cardHref} /> : null}
    </li>
  );
}

export function WhatsNewList({
  notes,
  className,
  cardHref,
  unseenKeys,
}: {
  notes: readonly PatchNote[];
  className?: string;
  cardHref?: (id: string) => string;
  /** `noteKey`s of the notes that changed since the last visit. */
  unseenKeys?: ReadonlySet<string>;
}) {
  const [topic, setTopic] = useState<TopicFilter>("all");
  const [query, setQuery] = useState("");
  const [requested, setRequested] = useState(0);
  const [targetId, setTargetId] = useState("");
  const [jumpTo, setJumpTo] = useState<string | null>(null);

  // The address is read after mount, so the server-rendered page and the first client render match.
  useEffect(() => {
    const url = readUrl();
    setTopic(url.topic);
    setQuery(url.query);
    setTargetId(url.hash);
  }, []);

  const everyGroup = useMemo(() => groupByDate(notes), [notes]);
  const topicsOf = useMemo(() => new Map(notes.map((n) => [n, noteTopics(n)])), [notes]);
  const chips = useMemo(() => TOPICS.filter((t) => notes.some((n) => topicsOf.get(n)?.includes(t))), [notes, topicsOf]);
  const trimmed = query.trim();
  const active = topic !== "all" || trimmed !== "";
  const listed = useMemo(
    () => (active ? notes.filter((n) => (topic === "all" || topicsOf.get(n)?.includes(topic)) && matchesQuery(n, trimmed)) : notes),
    [active, notes, topic, topicsOf, trimmed],
  );
  const groups = useMemo(() => (active ? groupByDate(listed) : everyGroup), [active, listed, everyGroup]);

  const newNotes = useMemo(() => (unseenKeys && unseenKeys.size > 0 ? notes.filter((n) => unseenKeys.has(noteKey(n))) : []), [notes, unseenKeys]);
  const targetNote = useMemo(() => (targetId ? notes.find((n) => noteAnchor(n) === targetId) : undefined), [notes, targetId]);

  // The first screen always holds every new note and the note a link points at.
  let shownCount = Math.max(requested, initialGroupCount(groups));
  if (!active) {
    const oldestNew = newNotes[newNotes.length - 1];
    if (oldestNew) shownCount = Math.max(shownCount, groupCountThrough(groups, oldestNew.date));
    if (targetNote) shownCount = Math.max(shownCount, groupCountThrough(groups, targetNote.date));
  } else shownCount = groups.length;
  shownCount = Math.min(shownCount, groups.length);

  useEffect(() => {
    if (targetNote) document.getElementById(noteAnchor(targetNote))?.scrollIntoView?.({ block: "start" });
  }, [targetNote]);
  useEffect(() => {
    if (jumpTo === null) return;
    document.getElementById(`wn-day-${jumpTo}`)?.scrollIntoView?.({ block: "start" });
    setJumpTo(null);
  }, [jumpTo]);

  const months = useMemo(() => {
    const seen: string[] = [];
    for (const g of groups) if (!seen.includes(monthKey(g.date))) seen.push(monthKey(g.date));
    return seen;
  }, [groups]);

  if (notes.length === 0) return <p className={`wn-empty${className ? ` ${className}` : ""}`}>Nothing new yet.</p>;

  const remaining = groups.slice(shownCount).reduce((sum, g) => sum + g.notes.length, 0);
  const jumpToMonth = (key: string) => {
    const group = groups.find((g) => monthKey(g.date) === key);
    if (!group) return;
    setRequested(Math.max(shownCount, groupCountThrough(groups, group.date)));
    setJumpTo(group.date);
  };
  const setFilter = (nextTopic: TopicFilter, nextQuery: string) => {
    setTopic(nextTopic);
    setQuery(nextQuery);
    writeUrl(nextTopic, nextQuery);
  };
  const monthOptions = [{ value: "", label: "Jump to month" }, ...months.map((m) => ({ value: m, label: formatMonth(m) }))];

  return (
    <div className="wn-layout">
      {months.length > 1 ? (
        <nav className="wn-rail" aria-label="Months">
          <p className="wn-rail-title">Jump to month</p>
          <ul>
            {months.map((m) => (
              <li key={m}>
                <button type="button" className="wn-rail-btn" onClick={() => jumpToMonth(m)}>
                  {formatMonth(m)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="wn-main">
        {newNotes.length > 0 ? (
          <p className="wn-new-summary">
            <span className="wn-new">New</span> {newNotes.length} new since your last visit
          </p>
        ) : null}
        <div className="wn-toolbar">
          <label className="wn-search">
            <span className="wn-sr">Search updates</span>
            <input type="search" placeholder="Search updates" value={query} onChange={(e) => setFilter(topic, e.target.value)} />
          </label>
          <div className="wn-chips" role="group" aria-label="Filter by topic">
            <button type="button" className="wn-chip" aria-pressed={topic === "all"} onClick={() => setFilter("all", query)}>
              All
            </button>
            {chips.map((t) => (
              <button key={t} type="button" className="wn-chip" aria-pressed={topic === t} onClick={() => setFilter(t, query)}>
                {TOPIC_LABELS[t]}
              </button>
            ))}
          </div>
          {months.length > 1 ? (
            <div className="wn-month-select">
              <Select value="" onChange={(v) => v && jumpToMonth(v)} options={monthOptions} aria-label="Jump to month" />
            </div>
          ) : null}
        </div>
        {active ? (
          <p className="wn-count" aria-live="polite">
            {listed.length} {listed.length === 1 ? "update" : "updates"}
          </p>
        ) : null}
        {groups.length === 0 ? (
          <div className="wn-empty">
            <p>No updates match</p>
            <button type="button" className="wn-chip" onClick={() => setFilter("all", "")}>
              Clear
            </button>
          </div>
        ) : (
          <div className={`wn-list${className ? ` ${className}` : ""}`}>
            {groups.slice(0, shownCount).map((group) => (
              <section key={group.date} className="wn-day" aria-label={formatNoteDate(group.date)}>
                <h2 className="wn-date" id={`wn-day-${group.date}`}>
                  <time dateTime={group.date}>{formatNoteDate(group.date)}</time>
                </h2>
                <ul className="wn-notes">
                  {group.notes.map((note) => (
                    <NoteItem
                      key={`${note.date}-${note.title}`}
                      note={note}
                      isNew={unseenKeys?.has(noteKey(note)) ?? false}
                      isTarget={targetNote === note}
                      expandedByDefault={trimmed !== ""}
                      cardHref={cardHref}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {remaining > 0 ? (
              <button type="button" className="wn-older" onClick={() => setRequested(olderGroupCount(groups, shownCount))}>
                Show older ({remaining} more)
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function WhatsNewFeed({
  app,
  notes,
  className,
  cardHref,
}: {
  app: AppName;
  notes?: readonly PatchNote[];
  className?: string;
  cardHref?: (id: string) => string;
}) {
  const fetched = usePatchNotes();
  const all = notes ?? fetched;
  // What changed since the last visit is read once, before this visit marks everything seen.
  const [unseen, setUnseen] = useState<ReadonlySet<string> | null>(null);
  const captured = useRef(false);
  useEffect(() => {
    if (!all || captured.current) return;
    captured.current = true;
    setUnseen(new Set(loadUnseen(app, undefined, all).map(noteKey)));
  }, [app, all]);
  useEffect(() => {
    if (all) markAllSeen(app, undefined, all);
  }, [app, all]);
  const mine = useMemo(() => (all ? notesFor(app, all) : null), [app, all]);
  if (!mine) return <div className="wn-loading" aria-busy="true" />;
  return <WhatsNewList notes={mine} className={className} cardHref={cardHref} unseenKeys={unseen ?? undefined} />;
}
