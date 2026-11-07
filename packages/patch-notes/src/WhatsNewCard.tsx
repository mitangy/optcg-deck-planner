import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { AppName } from "./helpers";
import { loadUnseen, markAllSeen } from "./lastSeen";
import { usePatchNotes } from "./loadNotes";
import { WHATS_NEW_PATH } from "./paths";
import type { PatchNote } from "./types";

export type WhatsNewLinkProps = { to: string; className?: string; onClick?: () => void; children: ReactNode };

const SHOWN = 3;

/**
 * The once-per-update card: the newest few notes this browser hasn't seen, with
 * "See all" and "Got it". Fixed to the bottom corner, so showing or dismissing
 * it never moves the page. `Link` is the app's router link. Either button
 * records every current note as seen, so the card stays away until the next update.
 *
 * The notes are a separate chunk, fetched after mount (the card is a fixed overlay, so nothing
 * moves when it appears). `notes` skips the fetch: tests and pre-rendering pass them in.
 */
export function WhatsNewCard({
  app,
  Link,
  to = WHATS_NEW_PATH,
  notes,
}: {
  app: AppName;
  Link: ComponentType<WhatsNewLinkProps>;
  to?: string;
  notes?: readonly PatchNote[];
}) {
  const fetched = usePatchNotes();
  const all = notes ?? fetched;
  // Read once per mount: a first run records today's notes as seen and shows nothing.
  const [unseen, setUnseen] = useState<PatchNote[] | null>(() => (notes ? loadUnseen(app, undefined, notes) : null));
  useEffect(() => {
    if (all) setUnseen((prev) => prev ?? loadUnseen(app, undefined, all));
  }, [all, app]);
  const [open, setOpen] = useState(true);
  if (!open || !all || !unseen || unseen.length === 0) return null;

  const dismiss = () => {
    markAllSeen(app, undefined, all);
    setOpen(false);
  };
  const shown = unseen.slice(0, SHOWN);
  const more = unseen.length - shown.length;

  return (
    <aside className="wn-card" role="region" aria-label="What's new">
      <h2 className="wn-card-heading">What’s new</h2>
      <ul className="wn-card-list">
        {shown.map((note) => (
          <li key={`${note.date}-${note.title}`}>
            <strong>{note.title}</strong>
            <span>{note.text}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="wn-card-more">+{more} more</p> : null}
      <div className="wn-card-actions">
        <Link to={to} className="wn-card-link" onClick={dismiss}>
          See all
        </Link>
        <button type="button" className="wn-card-dismiss" onClick={dismiss}>
          Got it
        </button>
      </div>
    </aside>
  );
}
