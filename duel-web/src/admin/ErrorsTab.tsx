import { useState } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { compactAgo } from "../lib/relativeTime";
import type { AdminClientErrors, ClientErrorGroup } from "./adminApi";
import { formatCount, type RangeDays } from "./adminLogic";
import { RangePicker } from "./charts";

function StackDialog({ group, onClose }: { group: ClientErrorGroup; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} className="feedback-backdrop" panelClassName="feedback-card report-card">
      <DialogTitle className="feedback-title">{group.message}</DialogTitle>
      <p className="adm-muted upl-hint">
        {group.app} · {group.url || "no page"} · build {group.release || "unknown"}
      </p>
      <pre className="adm-err-stack" tabIndex={0}>
        {group.stack || "No stack was sent."}
      </pre>
      <div className="rpt-panel-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

export function ErrorsTab({ data, days, onDaysChange, stale = false }: { data: AdminClientErrors; days: RangeDays; onDaysChange: (days: RangeDays) => void; stale?: boolean }) {
  const [open, setOpen] = useState<ClientErrorGroup | null>(null);
  return (
    <>
      <div className="adm-range-row">
        <span className="adm-range-label">{formatCount(data.total)} errors in {data.groups.length} groups</span>
        <RangePicker value={days} onChange={onDaysChange} label="Date range in days" busy={stale} />
      </div>
      <section className={`panel${stale ? " adm-stale" : ""}`} aria-label="Errors">
        {data.groups.length === 0 ? (
          <p className="panel-copy adm-muted">No errors reported in this range.</p>
        ) : (
          <ul className="adm-errs">
            {data.groups.map((g) => (
              <li key={g.fingerprint}>
                <span className="adm-errs-main">
                  <b title={g.message}>{g.message}</b>
                  <small>
                    {g.url || "no page"} · build {g.release || "unknown"} · {formatCount(g.users)} signed-in {g.users === 1 ? "player" : "players"}
                  </small>
                </span>
                <span className={`adm-pill adm-pill-${g.app === "api" || g.app === "game-server" ? "bad" : "mid"}`}>{g.app}</span>
                <span className="adm-errs-count" title="Times seen">
                  ×{formatCount(g.count)}
                </span>
                <small className="adm-errs-when" title={g.last_seen}>
                  {compactAgo(g.last_seen)}
                </small>
                <button type="button" className="btn btn-ghost btn-sm adm-errs-open" onClick={() => setOpen(g)}>
                  Stack
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open ? <StackDialog group={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
