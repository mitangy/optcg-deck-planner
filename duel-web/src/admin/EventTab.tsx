import { useCallback, useEffect, useState } from "react";
import { Select } from "@optcg/ui/popups";
import { Tile } from "./charts";
import {
  type AdminEvent,
  type AdminEventSummary,
  type EventDrawee,
  type EventFields,
  commitEventSeed,
  createAdminEvent,
  deleteAdminEvent,
  drawEvent,
  eventCsvUrl,
  fetchAdminEvent,
  fetchAdminEvents,
  forfeitEventWinner,
  updateAdminEvent,
} from "./adminApi";
import {
  ariaSort,
  canCommitSeed,
  canDeleteEvent,
  canDrawEvent,
  defaultEventId,
  eventEditBody,
  eventFlagInfo,
  eventLocks,
  eventToForm,
  eventUsesDraw,
  newEventForm,
  nextSort,
  type ParticipantSortKey,
  type SortState,
  sortParticipants,
} from "./adminLogic";
import { eventStyleLabel } from "../events/eventLogic";
import { EventForm } from "./EventForm";

const n = (v: number) => v.toLocaleString("en-US");

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

/** Advisory flag pills (#809). On phones they sit under the name so they show without side-scrolling. */
function FlagPills({ flags, className }: { flags: readonly string[]; className?: string }) {
  return (
    <span className={className ? `adm-evt-flags ${className}` : "adm-evt-flags"}>
      {flags.map((f) => (
        <span key={f} className="adm-pill adm-pill-warn" title={eventFlagInfo(f).title}>
          {eventFlagInfo(f).label}
        </span>
      ))}
    </span>
  );
}

function SortHead({ label, k, sort, onSort, className }: { label: string; k: ParticipantSortKey; sort: SortState<ParticipantSortKey>; onSort: (k: ParticipantSortKey) => void; className?: string }) {
  const dir = ariaSort(sort, k);
  return (
    <th scope="col" className={className} aria-sort={dir}>
      <button type="button" className="adm-sort" onClick={() => onSort(k)}>
        {label}
        <span className="adm-sort-mark" aria-hidden>
          {dir === "ascending" ? "▲" : dir === "descending" ? "▼" : ""}
        </span>
      </button>
    </th>
  );
}

function Participants({ event }: { event: AdminEvent }) {
  const [sort, setSort] = useState<SortState<ParticipantSortKey>>({ key: "eligible", dir: "desc" });
  const rows = sortParticipants(event.participants, sort);
  const onSort = (k: ParticipantSortKey) => setSort((cur) => nextSort(cur, k, k === "name" || k === "email" ? "asc" : "desc"));
  return (
    <section className="panel" aria-label="Participants">
      <div className="adm-evt-head">
        <h2 className="panel-title">Participants</h2>
        <a className="btn btn-secondary btn-sm" href={eventCsvUrl(event.id)} download>
          Download CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="panel-copy adm-muted">Nobody has joined yet.</p>
      ) : (
        <div className="adm-table-wrap adm-evt-table">
          <table className="adm-table">
            <thead>
              <tr>
                <SortHead label="Name" k="name" sort={sort} onSort={onSort} />
                <SortHead label="Email" k="email" sort={sort} onSort={onSort} />
                <SortHead label="Games" k="games" sort={sort} onSort={onSort} className="num" />
                <SortHead label="Opponents" k="opponents" sort={sort} onSort={onSort} className="num" />
                <SortHead label="Eligible" k="eligible" sort={sort} onSort={onSort} />
                <SortHead label="Flags" k="flags" sort={sort} onSort={onSort} className="adm-evt-flagcol" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.user_id}>
                  <td>
                    {p.name}
                    {p.flags.length > 0 ? <FlagPills flags={p.flags} className="adm-evt-flags-inline" /> : null}
                  </td>
                  <td>{p.email}</td>
                  <td className="num">{p.games}</td>
                  <td className="num">{p.opponents}</td>
                  <td>
                    {p.eligible ? <span className="adm-pill adm-pill-ok">yes</span> : <span className="adm-pill adm-pill-mid">{p.excluded ?? "no"}</span>}
                  </td>
                  <td className="adm-evt-flagcol">
                    {p.flags.length === 0 ? <span className="adm-muted">—</span> : <FlagPills flags={p.flags} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Winners({ event, busy, onForfeit }: { event: AdminEvent; busy: boolean; onForfeit: (w: EventDrawee) => void }) {
  const draw = event.draw;
  if (!draw || !draw.drawn_at) return null;
  return (
    <section className="panel" aria-label="Winners">
      <h2 className="panel-title">Winners</h2>
      {draw.winners.length === 0 ? (
        <p className="panel-copy adm-muted">Nobody was eligible.</p>
      ) : (
        <ol className="adm-evt-winners">
          {draw.winners.map((w) => (
            <li key={w.user_id}>
              <span className="adm-evt-who">
                <b>{w.name}</b>
                <small>{w.email}</small>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onForfeit(w)}>
                Forfeit
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="adm-note">
        Drawn {when(draw.drawn_at)}. {draw.forfeited.length} forfeited; the next account in the ranking moves up.
      </p>
      <p className="adm-sub">Seed (revealed)</p>
      <code className="adm-evt-hash">{draw.seed}</code>
    </section>
  );
}

type Mode = { kind: "view" } | { kind: "edit" } | { kind: "new" };

/** Admin: create, edit and delete events (#1019), and for each the counters, seed commit, participants, draw and forfeits (#794). */
export function EventTab() {
  const [events, setEvents] = useState<AdminEventSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reload the picker, then the chosen event (or the default one when `pick` is not given and nothing is chosen). */
  const load = useCallback(async (pick?: string | null) => {
    try {
      const list = await fetchAdminEvents();
      setEvents(list);
      const id = pick && list.some((e) => e.id === pick) ? pick : defaultEventId(list);
      setSelected(id);
      setEvent(id ? await fetchAdminEvent(id) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the events.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickEvent(id: string) {
    setSelected(id);
    setMode({ kind: "view" });
    setBusy(true);
    try {
      setEvent(await fetchAdminEvent(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the event.");
    } finally {
      setBusy(false);
    }
  }

  async function act(run: () => Promise<AdminEvent>) {
    setBusy(true);
    try {
      setEvent(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function save(fields: EventFields) {
    if (!event && mode.kind !== "new") return;
    setBusy(true);
    setFormError(null);
    try {
      const saved =
        mode.kind === "new" || !event ? await createAdminEvent(fields) : await updateAdminEvent(event.id, eventEditBody(fields, eventLocks(event).fields));
      setMode({ kind: "view" });
      await load(saved.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the event.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: AdminEvent) {
    if (!window.confirm(`Delete ${target.title}? Its entries and any committed seed are removed too. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteAdminEvent(target.id);
      await load(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the event.");
    } finally {
      setBusy(false);
    }
  }

  if (!events) {
    return error ? (
      <p className="panel-copy adm-error" role="alert">
        Could not load the events: {error}
      </p>
    ) : (
      <p className="panel-copy adm-muted" role="status">
        Loading…
      </p>
    );
  }

  const startNew = () => {
    setFormError(null);
    setMode({ kind: "new" });
  };
  const picker = (
    <div className="adm-evt-picker">
      <Select<string>
        aria-label="Event"
        className="adm-evt-select"
        value={selected ?? ""}
        onChange={(id) => void pickEvent(id)}
        disabled={busy || events.length === 0}
        options={events.length === 0 ? [{ value: "", label: "No events yet" }] : events.map((e) => ({ value: e.id, label: e.title, sub: `${e.status} · ${when(e.starts_at)}` }))}
      />
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || mode.kind === "new"} onClick={startNew}>
        New event
      </button>
    </div>
  );

  const errorLine = error ? (
    <p className="adm-error" role="alert">
      {error}
    </p>
  ) : null;

  if (mode.kind === "new") {
    return (
      <div className="adm-evt">
        {picker}
        <EventForm
          title="New event"
          initial={newEventForm(new Date())}
          locked={new Set()}
          lockReason={null}
          busy={busy}
          error={formError}
          onSave={(f) => void save(f)}
          onCancel={() => setMode({ kind: "view" })}
        />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="adm-evt">
        {picker}
        {errorLine}
        <p className="panel-copy adm-muted">{events.length === 0 ? "No events yet. Press New event to create one." : "Loading…"}</p>
      </div>
    );
  }

  const draw = event.draw;
  const locks = eventLocks(event);
  const usesDraw = eventUsesDraw(event);
  return (
    <div className="adm-evt">
      {picker}
      <div className="adm-evt-head">
        <h2 className="panel-title">
          {event.title} <span className="adm-pill adm-pill-mid">{event.status}</span>
        </h2>
        <div className="adm-evt-actions adm-evt-head-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || mode.kind === "edit"} onClick={() => { setFormError(null); setMode({ kind: "edit" }); }}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm adm-danger"
            disabled={busy || !canDeleteEvent(event)}
            title={canDeleteEvent(event) ? undefined : "The draw already ran, so this event is kept"}
            onClick={() => void remove(event)}
          >
            Delete
          </button>
          <button type="button" className="btn btn-secondary btn-sm adm-refresh" disabled={busy} onClick={() => void load(event.id)}>
            Refresh
          </button>
        </div>
      </div>
      <p className="adm-note">
        {when(event.starts_at)} to {when(event.ends_at)} · {eventStyleLabel(event)}
      </p>
      <p className="adm-note">
        {event.prize || "No prize listed"} · {usesDraw ? `random draw, ${event.winners_count} winners` : "top finishers, awarded by hand"} · {event.min_games} games, {event.min_opponents} opponents
      </p>
      {errorLine}

      {mode.kind === "edit" ? (
        <EventForm
          key={event.id}
          title="Edit event"
          initial={eventToForm(event)}
          locked={locks.fields}
          lockReason={locks.reason}
          busy={busy}
          error={formError}
          onSave={(f) => void save(f)}
          onCancel={() => setMode({ kind: "view" })}
        />
      ) : null}

      <div className="adm-tiles">
        <Tile label="Joined" value={n(event.counters.opted_in)} />
        <Tile label="Games in window" value={n(event.counters.games_in_window)} />
        <Tile label="Players with a game" value={n(event.counters.players_with_game)} />
        <Tile label="Eligible" value={n(event.counters.eligible)} />
        <Tile label="Flagged eligible" value={n(event.counters.flagged_eligible)} sub="check these before the draw" />
      </div>

      {usesDraw ? (
        <section className="panel" aria-label="Seed and draw">
          <h2 className="panel-title">Seed and draw</h2>
          {draw ? (
            <>
              <p className="adm-sub">Seed hash (public)</p>
              <code className="adm-evt-hash">{draw.seed_hash}</code>
              <p className="adm-note">Committed {when(draw.committed_at)}</p>
            </>
          ) : (
            <p className="panel-copy adm-muted">No seed committed yet. Commit one before the event starts so the hash can be published.</p>
          )}
          <div className="adm-evt-actions">
            {canCommitSeed(event) ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Commit the secret seed now? Its hash becomes public and this cannot be redone.")) void act(() => commitEventSeed(event.id));
                }}
              >
                Commit seed
              </button>
            ) : null}
            {canDrawEvent(event) ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Run the draw now? This reveals the seed and picks the winners.")) void act(() => drawEvent(event.id));
                }}
              >
                Run the draw
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="panel" aria-label="Prizes">
          <h2 className="panel-title">Prizes</h2>
          <p className="panel-copy adm-muted">This event awards prizes to the top finishers, so there is no seed or draw. Hand the prizes out yourself when it ends.</p>
        </section>
      )}

      {usesDraw ? (
        <Winners
          event={event}
          busy={busy}
          onForfeit={(w) => {
            if (window.confirm(`Forfeit ${w.name}? The next account in the ranking becomes a winner.`)) void act(() => forfeitEventWinner(event.id, w.user_id));
          }}
        />
      ) : null}
      <Participants event={event} />
    </div>
  );
}
