import { useEffect, useRef, useState } from "react";
import { listThreads } from "./client";
import { groupThreads, type LogPoseScope, type ThreadGroup, type ThreadRow } from "./scopes";

type Loaded = { state: "loading" } | { state: "error" } | { state: "ready"; groups: ThreadGroup[] };

const when = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * The Chats button under the panel header and the list it opens: this page's chats first, then recent ones by
 * kind. The list is an overlay (nothing under it moves) and is fetched each time it opens.
 */
export function ChatsMenu({
  apiBase,
  active,
  threadId,
  busy,
  onPick,
}: {
  apiBase: string;
  /** The page's chat: its own chats come first. */
  active: LogPoseScope;
  /** The chat on show. */
  threadId: number | null;
  /** An answer is streaming: it must land in its own chat, so picking another waits. */
  busy: boolean;
  onPick: (row: ThreadRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoaded({ state: "loading" });
    const none: ThreadRow[] = [];
    Promise.all([listThreads(apiBase, active.key).then((r) => ({ ok: true, r }), () => ({ ok: false, r: none })), listThreads(apiBase).then((r) => ({ ok: true, r }), () => ({ ok: false, r: none }))]).then(([here, recent]) => {
      if (!live) return;
      if (!here.ok && !recent.ok) setLoaded({ state: "error" });
      else setLoaded({ state: "ready", groups: groupThreads(here.r, recent.r, active.key) });
    });
    return () => {
      live = false;
    };
  }, [open, apiBase, active.key]);

  // Esc closes the list (not the panel), and so does a press outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    const onDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="lp-chats">
      <button type="button" className="lp-btn lp-btn-quiet lp-chats-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Chats
      </button>
      {open ? (
        <div className="lp-chats-menu" role="region" aria-label="Your chats">
          {loaded.state === "loading" ? <p className="lp-note lp-chats-note">Loading your chats…</p> : null}
          {loaded.state === "error" ? <p className="lp-note lp-chats-note">Could not load your chats.</p> : null}
          {loaded.state === "ready" && loaded.groups.length === 0 ? <p className="lp-note lp-chats-note">No saved chats yet.</p> : null}
          {loaded.state === "ready"
            ? loaded.groups.map((g) => (
                <section key={g.id} className="lp-chats-group" data-group={g.id}>
                  <h3 className="lp-chats-heading">{g.label}</h3>
                  <ul className="lp-chats-list">
                    {g.threads.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="lp-chats-row"
                          aria-current={t.id === threadId ? "true" : undefined}
                          disabled={busy && t.id !== threadId}
                          title={busy && t.id !== threadId ? "Wait for the answer to finish" : undefined}
                          onClick={() => {
                            setOpen(false);
                            if (t.id !== threadId) onPick(t);
                          }}
                        >
                          <span className="lp-chats-title">{t.title || "Untitled chat"}</span>
                          <span className="lp-chats-when">{when(t.updated_at)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
