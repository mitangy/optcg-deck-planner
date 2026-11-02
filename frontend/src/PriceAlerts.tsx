import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Dialog, Popover, PopoverButton, PopoverPanel, Select } from "@optcg/ui/popups";
import {
  api,
  money,
  type AlertDirection,
  type AppNotification,
  type CatalogCardResult,
  type PriceAlert,
  type PrintingView,
} from "./api";
import { CardArtImg, CardThumb } from "./CardThumb";

// ---------------------------------------------------------------- helpers

const DIRECTION_OPTIONS = [
  { value: "below" as AlertDirection, label: "At or below" },
  { value: "above" as AlertDirection, label: "At or above" },
];

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type AlertStatus = { label: string; tone: "watching" | "hit" | "met" | "paused" };

/** The chip on an alert row: what is it doing right now. */
export function alertStatus(a: Pick<PriceAlert, "paused" | "armed" | "triggered_at" | "triggered_price" | "met_now" | "direction" | "current_price">): AlertStatus {
  if (a.paused) return { label: "Paused", tone: "paused" };
  if (!a.armed && a.triggered_at) {
    const when = dayFmt.format(new Date(a.triggered_at));
    const hitPrice = a.triggered_price ?? a.current_price;
    return {
      label: hitPrice != null ? `Hit ${when} at ${money(hitPrice)}` : `Hit ${when}`,
      tone: "hit",
    };
  }
  if (a.met_now) {
    return { label: a.direction === "below" ? "Already below target" : "Already above target", tone: "met" };
  }
  return { label: "Watching", tone: "watching" };
}

/** A starting target about 10% away from the current price, in the direction being watched. */
export function defaultTargetPrice(price: number | null | undefined, direction: AlertDirection): string {
  if (price == null || !(price > 0)) return "";
  const t = direction === "below" ? price * 0.9 : price * 1.1;
  return (Math.round(t * 100) / 100).toFixed(2);
}

/** Price of one art: product 0 is the base (cheapest plain printing), otherwise that printing. */
export function artPrice(printings: readonly PrintingView[] | undefined, productId: number): number | null {
  if (!printings) return null;
  if (productId > 0) return printings.find((p) => p.product_id === productId)?.market_price ?? null;
  return printings.find((p) => !p.is_special)?.market_price ?? null;
}

/** Parses a typed target; null when it is not a usable price. */
export function parseTarget(raw: string): number | null {
  const n = Number(raw.replace(/^\$/, "").trim());
  if (!raw.trim() || !Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : dayFmt.format(new Date(iso));
}

// ---------------------------------------------------------------- data hooks

const ALERTS_KEY = ["price-alerts"] as const;

export function usePriceAlerts() {
  return useQuery({ queryKey: ALERTS_KEY, queryFn: api.priceAlerts });
}

function useAlertActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ALERTS_KEY });
  const save = useMutation({ mutationFn: api.savePriceAlert, onSuccess: refresh });
  const patch = useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.patchPriceAlert>[1] }) =>
      api.patchPriceAlert(v.id, v.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: api.deletePriceAlert, onSuccess: refresh });
  return { save, patch, remove };
}

// ---------------------------------------------------------------- editor form

/** Target + direction (+ delivery toggles) form shared by the Watch dialog and the lightbox. */
function AlertForm({
  cardId,
  productId,
  price,
  existing,
  emailEnabled,
  compact = false,
  onSaved,
  onCancel,
}: {
  cardId: string;
  productId: number;
  price: number | null;
  existing?: PriceAlert;
  emailEnabled: boolean;
  compact?: boolean;
  onSaved: (alert: PriceAlert) => void;
  onCancel?: () => void;
}) {
  const { save } = useAlertActions();
  const [direction, setDirection] = useState<AlertDirection>(existing?.direction ?? "below");
  const [target, setTarget] = useState(
    existing ? existing.target_price.toFixed(2) : defaultTargetPrice(price, "below"),
  );
  const [touched, setTouched] = useState(Boolean(existing));
  const [email, setEmail] = useState(existing?.notify_email ?? true);
  const [inApp, setInApp] = useState(existing?.notify_app ?? true);
  // The price can arrive after the form opens; fill the suggestion only while the user has not typed.
  useEffect(() => {
    if (!touched) setTarget(defaultTargetPrice(price, direction));
  }, [price, direction, touched]);

  const parsed = parseTarget(target);
  const noChannel = !email && !inApp;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (parsed == null || noChannel) return;
    save.mutate(
      {
        card_id: cardId,
        product_id: productId,
        target_price: parsed,
        direction,
        notify_email: email,
        notify_app: inApp,
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <form className={`alert-form${compact ? " compact" : ""}`} onSubmit={submit}>
      <p className="alert-form-now muted">Now {money(price)}</p>
      <div className="alert-form-row">
        <Select
          value={direction}
          onChange={(d) => setDirection(d)}
          options={DIRECTION_OPTIONS}
          aria-label="Alert direction"
          className="alert-dir"
        />
        <label className="alert-money">
          <span className="sr-only">Target price in dollars</span>
          <span aria-hidden="true">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={target}
            placeholder="0.00"
            aria-invalid={target !== "" && parsed == null}
            onChange={(e) => {
              setTouched(true);
              setTarget(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="alert-form-checks">
        <label className="alert-check" title={emailEnabled ? undefined : "Email isn't switched on yet"}>
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          Email
        </label>
        <label className="alert-check">
          <input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} />
          In app
        </label>
      </div>
      <div className="alert-form-actions">
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn primary" disabled={parsed == null || noChannel || save.isPending}>
          {save.isPending ? "Saving…" : existing ? "Save alert" : "Set alert"}
        </button>
      </div>
      {parsed == null && target !== "" ? <p className="error alert-form-msg">Enter a price above $0.</p> : null}
      {noChannel ? <p className="error alert-form-msg">Pick Email or In app.</p> : null}
      {save.isError ? <p className="error alert-form-msg">{(save.error as Error).message}</p> : null}
    </form>
  );
}

// ---------------------------------------------------------------- lightbox control

/** Under an enlarged card art: set, edit or remove the price alert for that exact art. */
export function LightboxPriceAlertControl({ cardId, productId = 0 }: { cardId: string; productId?: number }) {
  const alertsQ = usePriceAlerts();
  const existing = alertsQ.data?.alerts.find((a) => a.card_id === cardId && a.product_id === productId);
  const [editing, setEditing] = useState(false);
  const printingsQ = useQuery({
    queryKey: ["card-printings", cardId],
    queryFn: () => api.cardPrintings(cardId),
    enabled: editing && !existing,
  });
  const { remove } = useAlertActions();
  const price = existing?.current_price ?? artPrice(printingsQ.data, productId);

  return (
    <div className="lightbox-alert">
      <div className="lightbox-alert-row">
        {existing ? (
          <>
            <span className="lightbox-alert-text" title={alertStatus(existing).label}>
              Alert: {existing.direction === "below" ? "below" : "above"} {money(existing.target_price)}
            </span>
            <button type="button" className="ghost" onClick={() => setEditing((v) => !v)}>
              Edit
            </button>
            <button type="button" className="ghost danger" disabled={remove.isPending} onClick={() => remove.mutate(existing.id)}>
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn secondary lightbox-alert-btn"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
          >
            Price alert
          </button>
        )}
      </div>
      {editing ? (
        <div className="lightbox-alert-pop" role="group" aria-label="Price alert">
          <AlertForm
            key={existing?.id ?? "new"}
            cardId={cardId}
            productId={productId}
            price={price}
            existing={existing}
            emailEnabled={alertsQ.data?.email_enabled ?? false}
            compact
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- watch dialog (page)

export function WatchDialog({ card, onClose }: { card: CatalogCardResult; onClose: () => void }) {
  const alertsQ = usePriceAlerts();
  const printingsQ = useQuery({ queryKey: ["card-printings", card.card_id], queryFn: () => api.cardPrintings(card.card_id) });
  // Search can list an alt art as its own row; its price and image are then the alt's, not the base's.
  const rowAlt = card.alt_product_id ?? 0;
  const [productId, setProductId] = useState(rowAlt);
  const [saved, setSaved] = useState<PriceAlert | null>(null);
  const alts = (printingsQ.data ?? []).filter((p) => p.is_special);
  const basePrinting = (printingsQ.data ?? []).find((p) => !p.is_special);
  const basePrice = rowAlt ? artPrice(printingsQ.data, 0) : (card.market_price ?? artPrice(printingsQ.data, 0));
  const baseImage = rowAlt ? (basePrinting?.image_url ?? "") : card.image_url;
  const price = productId === 0 ? basePrice : artPrice(printingsQ.data, productId);
  const existing = alertsQ.data?.alerts.find((a) => a.card_id === card.card_id && a.product_id === productId);

  const tiles: { id: number; name: string; price: number | null; image: string }[] = [
    { id: 0, name: "Base", price: basePrice, image: baseImage },
    ...alts.map((p) => ({ id: p.product_id, name: p.name, price: p.market_price, image: p.image_url })),
  ];

  return (
    <Dialog open onClose={onClose} className="alert-dialog" panelClassName="alert-dialog-panel" label={`Price alert for ${card.name}`}>
      <div className="alert-dialog-head">
        <div>
          <p className="eyebrow">{card.card_id}</p>
          <h2>{card.name}</h2>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {saved ? (
        <div className="alert-dialog-done">
          <p>
            <strong>Watching.</strong> We'll tell you when {saved.art_name === "Base" ? "the base art" : saved.art_name}{" "}
            {saved.direction === "below" ? "falls to" : "rises to"} {money(saved.target_price)}.
          </p>
          {saved.met_now ? (
            <p className="muted">
              It's already {saved.direction === "below" ? "at or below" : "at or above"} that, so you'll hear
              the next time it crosses.
            </p>
          ) : null}
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <>
          <p className="alert-dialog-label">Which art?</p>
          <div className="alert-art-picker" role="radiogroup" aria-label="Which art to watch">
            {tiles.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === productId}
                className={`alert-art-tile${t.id === productId ? " selected" : ""}`}
                onClick={() => setProductId(t.id)}
                title={t.name}
              >
                <CardArtImg src={t.image || undefined} cardId={card.card_id} alt="" className="thumb" />
                <span className="alert-art-name">{t.name}</span>
                <span className="alert-art-price">{money(t.price)}</span>
              </button>
            ))}
            {printingsQ.isLoading ? <span className="muted alert-art-loading">Loading alt arts…</span> : null}
          </div>
          <AlertForm
            key={`${productId}:${existing?.id ?? "new"}`}
            cardId={card.card_id}
            productId={productId}
            price={price}
            existing={existing}
            emailEnabled={alertsQ.data?.email_enabled ?? false}
            onSaved={setSaved}
          />
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- alert rows

function AlertRow({ alert, emailEnabled }: { alert: PriceAlert; emailEnabled: boolean }) {
  const { patch, remove } = useAlertActions();
  const [target, setTarget] = useState(alert.target_price.toFixed(2));
  useEffect(() => setTarget(alert.target_price.toFixed(2)), [alert.target_price]);
  const status = alertStatus(alert);
  const busy = patch.isPending || remove.isPending;
  const parsed = parseTarget(target);

  function commitTarget() {
    if (parsed == null) return setTarget(alert.target_price.toFixed(2));
    if (parsed !== alert.target_price) patch.mutate({ id: alert.id, patch: { target_price: parsed } });
  }

  const name = `${alert.card_name}${alert.is_alt ? ` (${alert.art_name})` : ""}`;
  return (
    <li className={`alert-row${alert.paused ? " paused" : ""}`} data-alert-id={alert.id}>
      <div className="alert-art">
        <CardThumb src={alert.image_url || undefined} cardId={alert.card_id} alt={name} productId={alert.product_id} />
      </div>
      <div className="alert-card">
        <div className="card-id">{alert.card_id}</div>
        <div className="alert-card-name">{alert.card_name}</div>
        <div className="muted alert-card-art">{alert.is_alt ? alert.art_name : "Base art"}</div>
        <span className={`alert-chip ${status.tone}`}>{status.label}</span>
      </div>
      <div className="alert-now">
        <span className="alert-col-label">Market</span>
        {alert.tcgplayer_url ? (
          <a href={alert.tcgplayer_url} target="_blank" rel="noreferrer">
            {money(alert.current_price)}
          </a>
        ) : (
          <span>{money(alert.current_price)}</span>
        )}
      </div>
      <div className="alert-target">
        <span className="alert-col-label">Alert me when price is</span>
        <div className="alert-target-controls">
          <Select
            value={alert.direction}
            onChange={(direction) => patch.mutate({ id: alert.id, patch: { direction } })}
            options={DIRECTION_OPTIONS}
            aria-label={`Direction for ${name}`}
            className="alert-dir"
            disabled={busy}
          />
          <label className="alert-money">
            <span className="sr-only">{`Target price for ${name}`}</span>
            <span aria-hidden="true">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={target}
              aria-invalid={parsed == null}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={commitTarget}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
        </div>
      </div>
      <div className="alert-toggles">
        <label className="alert-check" title={emailEnabled ? undefined : "Email isn't switched on yet"}>
          <input
            type="checkbox"
            checked={alert.notify_email}
            disabled={busy}
            onChange={(e) => patch.mutate({ id: alert.id, patch: { notify_email: e.target.checked } })}
          />
          Email
        </label>
        <label className="alert-check">
          <input
            type="checkbox"
            checked={alert.notify_app}
            disabled={busy}
            onChange={(e) => patch.mutate({ id: alert.id, patch: { notify_app: e.target.checked } })}
          />
          In app
        </label>
      </div>
      <div className="alert-actions">
        <button
          type="button"
          className="ghost alert-act"
          disabled={busy}
          onClick={() => patch.mutate({ id: alert.id, patch: { paused: !alert.paused } })}
        >
          {alert.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="ghost danger alert-act"
          disabled={busy}
          aria-label={`Delete alert for ${name}`}
          onClick={() => remove.mutate(alert.id)}
        >
          Delete
        </button>
      </div>
      {patch.isError || remove.isError ? (
        <p className="error alert-row-error">{((patch.error ?? remove.error) as Error).message}</p>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------- page

export function PriceAlertsPage({
  renderSearch,
}: {
  /** Catalog search drawer (lives in App.tsx); `renderAction` supplies the per-result button. */
  renderSearch: (renderAction: (card: CatalogCardResult) => ReactNode) => ReactNode;
}) {
  const alertsQ = usePriceAlerts();
  const [watching, setWatching] = useState<CatalogCardResult | null>(null);
  const alerts = alertsQ.data?.alerts ?? [];
  const emailEnabled = alertsQ.data?.email_enabled ?? false;

  return (
    <section className="alerts-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Price alerts</p>
          <h1>Alerts</h1>
          <p className="muted alerts-explainer">
            Get told when a card's TCGPlayer market price hits your target. Checked when prices update: hourly
            for new sets, daily for the rest.
          </p>
        </div>
      </div>
      {alertsQ.data && !emailEnabled ? (
        <p className="alerts-note">Email alerts aren't switched on yet; you'll see alerts in the bell for now.</p>
      ) : null}

      {renderSearch((card) => (
        <button
          type="button"
          className="btn secondary"
          aria-label={`Watch ${card.card_id} price`}
          onClick={() => setWatching(card)}
        >
          Watch
        </button>
      ))}

      {alertsQ.isLoading ? <p className="muted">Loading your alerts…</p> : null}
      {alertsQ.error ? <p className="error">{(alertsQ.error as Error).message}</p> : null}
      {alertsQ.data && alerts.length === 0 ? (
        <div className="alerts-empty">
          <h2>No alerts yet</h2>
          <p className="muted">
            Search for a card above and press Watch, or tap any card art and press Price alert. Alt arts are
            tracked separately from the base art.
          </p>
        </div>
      ) : null}
      {alerts.length > 0 ? (
        <ul className="alert-list">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} emailEnabled={emailEnabled} />
          ))}
        </ul>
      ) : null}
      {watching ? <WatchDialog card={watching} onClose={() => setWatching(null)} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- bell

/** Unread count as shown on the bell; nothing at 0. */
export function BellBadge({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span className="bell-badge" aria-hidden="true">
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function BellPanel({ items, close }: { items: AppNotification[]; close: () => void }) {
  const qc = useQueryClient();
  const read = useMutation({
    mutationFn: (ids?: number[]) => api.markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  // Dots reflect what was unread when the panel opened; opening is what marks them read.
  const unreadAtOpen = useRef(new Set(items.filter((n) => !n.read_at).map((n) => n.id)));
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current || unreadAtOpen.current.size === 0) return;
    markedRef.current = true;
    read.mutate([...unreadAtOpen.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="bell-head">
        <h2 className="head-popover-title">Notifications</h2>
        <button type="button" className="ghost" disabled={read.isPending || items.length === 0} onClick={() => read.mutate(undefined)}>
          Mark all read
        </button>
      </div>
      {items.length === 0 ? (
        <p className="muted bell-empty">Nothing yet. Price alerts you set will show up here.</p>
      ) : (
        <ul className="bell-list">
          {items.map((n) => {
            const body = (
              <>
                <span className="bell-title">{n.title}</span>
                <span className="bell-body muted">{n.body}</span>
                <span className="bell-time muted">{timeAgo(n.created_at)}</span>
              </>
            );
            return (
              <li key={n.id} className={`bell-item${unreadAtOpen.current.has(n.id) ? " unread" : ""}`}>
                <span className="bell-dot" aria-label={unreadAtOpen.current.has(n.id) ? "Unread" : undefined} />
                {n.link && n.link.startsWith("/") ? (
                  <Link to={n.link} className="bell-text" onClick={close}>
                    {body}
                  </Link>
                ) : (
                  <span className="bell-text">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/alerts" className="bell-manage" onClick={close}>
        Manage alerts
      </Link>
    </>
  );
}

export function NotificationsBell() {
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications(30),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const unread = q.data?.unread ?? 0;
  return (
    <Popover as="div" className="bell">
      <PopoverButton
        type="button"
        className="bell-btn"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <BellIcon />
        <BellBadge unread={unread} />
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 8, padding: 8 }}
        role="dialog"
        aria-label="Notifications"
        className="head-popover-panel bell-panel"
        style={{ width: "min(360px, calc(100vw - 16px))" }}
      >
        {({ close }: { close: () => void }) => <BellPanel items={q.data?.items ?? []} close={close} />}
      </PopoverPanel>
    </Popover>
  );
}
