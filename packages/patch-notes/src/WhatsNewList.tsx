import { useEffect, useMemo } from "react";
import { groupByDate, notesFor, type AppName } from "./helpers";
import { markAllSeen } from "./lastSeen";
import { usePatchNotes } from "./loadNotes";
import type { PatchNote } from "./types";

const DAY = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** "2026-10-08" as "October 8, 2026" (dates are UTC days, so the label never depends on the viewer's timezone). */
export function formatNoteDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : DAY.format(d);
}

/** Notes grouped under a heading per day, newest first. Entries that also apply to the other app say so. */
export function WhatsNewList({ notes, className }: { notes: readonly PatchNote[]; className?: string }) {
  const groups = groupByDate(notes);
  if (groups.length === 0) return <p className={`wn-empty${className ? ` ${className}` : ""}`}>Nothing new yet.</p>;
  return (
    <div className={`wn-list${className ? ` ${className}` : ""}`}>
      {groups.map((group) => (
        <section key={group.date} className="wn-day" aria-label={formatNoteDate(group.date)}>
          <h2 className="wn-date">
            <time dateTime={group.date}>{formatNoteDate(group.date)}</time>
          </h2>
          <ul className="wn-notes">
            {group.notes.map((note) => (
              <li key={`${note.date}-${note.title}`} className="wn-note">
                <p className="wn-title">
                  <span>{note.title}</span>
                  {note.app === "both" ? <span className="wn-tag">Duel + Planner</span> : null}
                </p>
                <p className="wn-text">{note.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The What's new page body for `app`: fetches the notes chunk, lists the app's notes, and counts the
 * visit as seeing the latest update once they are loaded. `notes` skips the fetch (the static pre-render).
 */
export function WhatsNewFeed({ app, notes, className }: { app: AppName; notes?: readonly PatchNote[]; className?: string }) {
  const fetched = usePatchNotes();
  const all = notes ?? fetched;
  useEffect(() => {
    if (all) markAllSeen(app, undefined, all);
  }, [app, all]);
  const mine = useMemo(() => (all ? notesFor(app, all) : null), [app, all]);
  if (!mine) return <div className="wn-loading" aria-busy="true" />;
  return <WhatsNewList notes={mine} className={className} />;
}
