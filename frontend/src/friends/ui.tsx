import type { ReactNode } from "react";
import { CardThumb } from "../CardThumb";

/** One card in a compact row: art, id + name, a meta line, and a controls slot that wraps under the text on narrow screens. */
export function CardRow({
  cardId,
  name,
  imageUrl,
  meta,
  children,
  className = "",
}: {
  cardId: string;
  name: string;
  imageUrl?: string;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li className={`friend-card-row ${className}`.trim()} data-card-id={cardId}>
      <div className="friend-card-art">
        <CardThumb src={imageUrl || undefined} cardId={cardId} alt={name} />
      </div>
      <div className="friend-card-info">
        <div className="card-id">{cardId}</div>
        <div className="friend-card-name">{name}</div>
        {meta ? <div className="friend-card-meta muted">{meta}</div> : null}
      </div>
      {children ? <div className="friend-card-actions">{children}</div> : null}
    </li>
  );
}

/** − qty + with a stable hit target. `max` caps the plus button. */
export function QtyStepper({
  value,
  max,
  min = 0,
  label,
  onChange,
}: {
  value: number;
  max: number;
  min?: number;
  label: string;
  onChange: (next: number) => void;
}) {
  return (
    <span className="owned-wrap friend-stepper">
      <button type="button" className="owned-btn" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="friend-stepper-qty" aria-label={`${label} count`}>
        {value}
      </span>
      <button type="button" className="owned-btn" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

export type TabDef<K extends string> = { key: K; label: string; count?: number };

export function Tabs<K extends string>({ tabs, active, onChange, label }: { tabs: TabDef<K>[]; active: K; onChange: (key: K) => void; label: string }) {
  return (
    <div className="friend-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={t.key === active ? "active" : ""}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count ? <span className="friend-tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state friend-empty">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <p className="error friend-error" role="alert">
      {(error as Error)?.message || "Something went wrong."}
      {onRetry ? (
        <>
          {" "}
          <button type="button" className="ghost linkish" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : null}
    </p>
  );
}

export const dateLabel = (unixSeconds: number | null | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
