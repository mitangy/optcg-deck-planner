import { useState } from "react";
import { Select } from "@optcg/ui/popups";
import {
  EVENT_BRACKET_SIZES,
  EVENT_FORMAT_OPTIONS,
  EVENT_PRIZE_METHOD_OPTIONS,
  type EventForm as EventFormValues,
  type EventLockKey,
  eventFormPayload,
  zoneAbbr,
} from "./adminLogic";
import type { EventFields } from "./adminApi";

type Props = {
  title: string;
  initial: EventFormValues;
  locked: ReadonlySet<EventLockKey>;
  lockReason: string | null;
  busy: boolean;
  /** An error from the server for the last save. */
  error: string | null;
  onSave: (fields: EventFields) => void;
  onCancel: () => void;
};

/** Create or edit one event (#1019): dates, tourney style, prizing and the requirements to win. */
export function EventForm({ title, initial, locked, lockReason, busy, error, onSave, onCancel }: Props) {
  const [f, setF] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setF((cur) => ({ ...cur, [key]: value }));
  const zone = zoneAbbr(new Date().toISOString());
  const dis = (k: EventLockKey) => busy || locked.has(k);

  function submit() {
    const out = eventFormPayload(f);
    if (!out.ok) {
      setProblem(out.error);
      return;
    }
    setProblem(null);
    onSave(out.fields);
  }

  const text = (key: "title" | "prize", label: string, max: number) => (
    <label className="rpt-field adm-evt-wide">
      <span>{label}</span>
      <input type="text" value={f[key]} maxLength={max} disabled={busy} onChange={(e) => set(key, e.target.value)} />
    </label>
  );
  const num = (key: "winners" | "minGames" | "minOpponents" | "minTurns", label: string, lock: EventLockKey) => (
    <label className="rpt-field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={key === "winners" ? 1 : 0} step={1} value={f[key]} disabled={dis(lock)} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  return (
    <form
      className="panel adm-evt-form"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="panel-title">{title}</h2>
      {lockReason ? <p className="adm-note">{lockReason}</p> : null}
      <div className="adm-evt-grid">
        {text("title", "Title", 80)}
        <label className="rpt-field adm-evt-wide">
          <span>Description (shown on the rules page)</span>
          <textarea rows={3} maxLength={4000} value={f.description} disabled={busy} onChange={(e) => set("description", e.target.value)} />
        </label>

        <label className="rpt-field">
          <span>Starts ({zone})</span>
          <input type="datetime-local" value={f.startsAt} disabled={dis("starts_at")} onChange={(e) => set("startsAt", e.target.value)} />
        </label>
        <label className="rpt-field">
          <span>Ends ({zone})</span>
          <input type="datetime-local" value={f.endsAt} disabled={dis("ends_at")} onChange={(e) => set("endsAt", e.target.value)} />
        </label>

        <Select
          label="Tourney style"
          className="rpt-field"
          value={f.format}
          onChange={(v) => set("format", v)}
          disabled={busy}
          options={EVENT_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Select
          label="Best of"
          className="rpt-field"
          value={f.bestOf}
          onChange={(v) => set("bestOf", v === 3 ? 3 : 1)}
          disabled={busy || f.format === "casual"}
          options={[
            { value: 1, label: "Best of 1" },
            { value: 3, label: "Best of 3" },
          ]}
        />
        {f.format === "single_elim" ? (
          <Select
            label="Bracket size"
            className="rpt-field"
            value={f.bracketSize}
            onChange={(v) => set("bracketSize", v)}
            disabled={busy}
            options={EVENT_BRACKET_SIZES.map((n) => ({ value: n, label: `${n} players` }))}
          />
        ) : null}

        {text("prize", "Prize summary (shown on the banner)", 200)}
        <label className="rpt-field adm-evt-wide">
          <span>Prize details (shown on the rules page)</span>
          <textarea rows={4} maxLength={4000} value={f.prizeDetails} disabled={busy} onChange={(e) => set("prizeDetails", e.target.value)} />
        </label>
        <Select
          label="Prizes awarded by"
          className="rpt-field adm-evt-wide"
          value={f.prizeMethod}
          onChange={(v) => set("prizeMethod", v)}
          disabled={dis("prize_method")}
          options={EVENT_PRIZE_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        {num("winners", "Winners", "winners")}
        {num("minGames", "Min games", "min_games")}
        {num("minOpponents", "Min opponents", "min_opponents")}
        {num("minTurns", "Min turns per game", "min_turns")}
      </div>
      <p className="adm-note">Staff and admins can play but can't win prizes.</p>
      <p className="adm-error adm-evt-error" role="alert">
        {problem ?? error}
      </p>
      <div className="adm-evt-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy}>
          Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
