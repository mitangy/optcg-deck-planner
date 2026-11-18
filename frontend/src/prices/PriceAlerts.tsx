import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLightboxPanel } from "./lightboxPanel";
import { Dialog, Popover, PopoverButton, PopoverPanel, useConfirm } from "@optcg/ui/popups";
import {
  api,
  money,
  type AlertDirection,
  type AppNotification,
  type CatalogCardResult,
  type PriceAlert,
  type PrintingView,
} from "../api";
import { CardArtImg, CardThumb } from "../ui/CardThumb";
import { qk } from "../cache/queryKeys";
import {
  alertDistance,
  alertStatus,
  artLabel,
  chipTarget,
  cleanCardName,
  formatTarget,
  groupAlerts,
  lastHitLine,
  recentHitCount,
  recentHitLine,
  shortArtName,
  type AlertStatus,
} from "./alertList";

export { alertStatus, type AlertStatus };

const DIRECTION_OPTIONS = [
  { value: "below" as AlertDirection, label: "Drops to" },
  { value: "above" as AlertDirection, label: "Rises to" },
];

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function defaultTargetPrice(price: number | null | undefined, direction: AlertDirection): string {
  if (price == null || !(price > 0)) return "";
  const t = direction === "below" ? price * 0.9 : price * 1.1;
  return (Math.round(t * 100) / 100).toFixed(2);
}

export function artPrice(printings: readonly PrintingView[] | undefined, productId: number): number | null {
  if (!printings) return null;
  if (productId > 0) return printings.find((p) => p.product_id === productId)?.market_price ?? null;
  return printings.find((p) => !p.is_special)?.market_price ?? null;
}

export function parseTarget(raw: string): number | null {
  const n = Number(raw.replace(/^\$/, "").replace(/,/g, "").trim());
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

export function usePriceAlerts() {
  return useQuery({ queryKey: qk.priceAlerts(), queryFn: api.priceAlerts });
}

function useAlertActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: qk.priceAlerts() });
  const save = useMutation({ mutationFn: api.savePriceAlert, onSuccess: refresh });
  const patch = useMutation({
    mutationFn: (v: { id: number; patch: Parameters<typeof api.patchPriceAlert>[1] }) =>
      api.patchPriceAlert(v.id, v.patch),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: api.deletePriceAlert, onSuccess: refresh });
  return { save, patch, remove };
}

function DirectionToggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: AlertDirection;
  onChange: (d: AlertDirection) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="alert-dir" role="radiogroup" aria-label={label}>
      {DIRECTION_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={`alert-dir-btn${o.value === value ? " on" : ""}`}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money input: shows "1,900.00" at rest and the raw text while you type. */
function TargetInput({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const n = parseTarget(value);
  const shown = focused || n == null ? value : formatTarget(n);
  return (
    <label className="alert-money">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        placeholder={placeholder}
        aria-invalid={value !== "" && n == null}
        onFocus={() => setFocused(true)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onBlur) (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function EmailCheck({
  checked,
  disabled,
  emailEnabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  emailEnabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`alert-check${emailEnabled ? "" : " off"}`}>
      <input
        type="checkbox"
        checked={emailEnabled && checked}
        disabled={disabled || !emailEnabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {emailEnabled ? "Email" : "Email is off"}
    </label>
  );
}

const QUICK_PCTS = [10, 20, 30];

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
  const noChannel = !(email && emailEnabled) && !inApp;

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
        <DirectionToggle value={direction} onChange={setDirection} label="Alert direction" />
        <TargetInput
          value={target}
          label="Target price in dollars"
          placeholder="0.00"
          onChange={(v) => {
            setTouched(true);
            setTarget(v);
          }}
        />
      </div>
      <div className="alert-form-chips" role="group" aria-label="Quick targets">
        {QUICK_PCTS.map((p) => (
          <button
            key={p}
            type="button"
            className="alert-chip-btn"
            disabled={!(price != null && price > 0)}
            aria-label={`Target ${p}% ${direction === "below" ? "under" : "over"} the current price`}
            onClick={() => {
              setTouched(true);
              setTarget(chipTarget(price, direction, p));
            }}
          >
            {direction === "below" ? "\u2212" : "+"}
            {p}%
          </button>
        ))}
      </div>
      <div className="alert-form-checks">
        <EmailCheck checked={email} emailEnabled={emailEnabled} onChange={setEmail} />
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

function AlertPill({
  alert,
  editing,
  removing,
  onEdit,
  onRemove,
}: {
  alert: PriceAlert;
  editing: boolean;
  removing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = alertStatus(alert);
  const goal = `${alert.direction === "below" ? "Below" : "Above"} ${money(alert.target_price)}`;
  return (
    <div className={`alert-pill ${status.tone}`} role="group" aria-label="Your price alert">
      <span className="alert-pill-icon">
        <BellIcon size={16} />
      </span>
      <span className="alert-pill-text" title={`Price alert: ${goal}. ${status.label}`}>
        <strong className="alert-pill-goal">{goal}</strong>
        <span className="alert-pill-status">{status.label}</span>
      </span>
      <button type="button" className="alert-pill-btn" aria-expanded={editing} onClick={onEdit}>
        Edit
      </button>
      <button
        type="button"
        className="alert-pill-btn danger"
        aria-label="Remove price alert"
        title="Remove price alert"
        disabled={removing}
        onClick={onRemove}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function LightboxPriceAlertControl({ cardId, productId = 0 }: { cardId: string; productId?: number }) {
  const alertsQ = usePriceAlerts();
  const existing = alertsQ.data?.alerts.find((a) => a.card_id === cardId && a.product_id === productId);
  const [editing, setEditing] = useLightboxPanel("alert");
  const printingsQ = useQuery({
    queryKey: qk.cardPrintings(cardId),
    queryFn: () => api.cardPrintings(cardId),
    enabled: editing && !existing,
  });
  const { remove } = useAlertActions();
  const price = existing?.current_price ?? artPrice(printingsQ.data, productId);

  return (
    <div className="lightbox-alert">
      <div className="lightbox-alert-row">
        {existing ? (
          <AlertPill
            alert={existing}
            editing={editing}
            removing={remove.isPending}
            onEdit={() => setEditing((v) => !v)}
            onRemove={() => remove.mutate(existing.id)}
          />
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

export function WatchDialog({ card, onClose }: { card: CatalogCardResult; onClose: () => void }) {
  const alertsQ = usePriceAlerts();
  const printingsQ = useQuery({ queryKey: qk.cardPrintings(card.card_id), queryFn: () => api.cardPrintings(card.card_id) });
  const rowAlt = card.alt_product_id ?? 0;
  const [productId, setProductId] = useState(rowAlt);
  const [saved, setSaved] = useState<PriceAlert | null>(null);
  const alts = (printingsQ.data ?? []).filter((p) => p.is_special);
  const basePrinting = (printingsQ.data ?? []).find((p) => !p.is_special);
  const basePrice = rowAlt ? artPrice(printingsQ.data, 0) : (card.market_price ?? artPrice(printingsQ.data, 0));
  const baseImage = rowAlt ? (basePrinting?.image_url ?? "") : card.image_url;
  const price = productId === 0 ? basePrice : artPrice(printingsQ.data, productId);
  const existing = alertsQ.data?.alerts.find((a) => a.card_id === card.card_id && a.product_id === productId);

  const tiles: { id: number; name: string; full?: string; price: number | null; image: string }[] = [
    { id: 0, name: "Base art", full: "Base", price: basePrice, image: baseImage },
    ...alts.map((p) => ({ id: p.product_id, name: shortArtName(p.name, card.name, card.card_id), full: p.name, price: p.market_price, image: p.image_url })),
  ];

  return (
    <Dialog open onClose={onClose} className="alert-dialog" panelClassName="alert-dialog-panel" label={`Price alert for ${card.name}`}>
      <div className="alert-dialog-head">
        <div>
          <p className="eyebrow">{card.card_id}</p>
          <h2>{cleanCardName(card.name, card.card_id)}</h2>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {saved ? (
        <div className="alert-dialog-done">
          <p>
            <strong>Watching.</strong> We'll tell you when {saved.art_name === "Base" ? "the base art" : shortArtName(saved.art_name, saved.card_name, saved.card_id)}{" "}
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
                title={t.full ?? t.name}
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

function BuyButton({ alert }: { alert: PriceAlert }) {
  if (!alert.tcgplayer_url) return null;
  return (
    <a className="btn primary alert-buy" href={alert.tcgplayer_url} target="_blank" rel="noreferrer">
      Buy on TCGPlayer
    </a>
  );
}

function alertNames(alert: PriceAlert) {
  const card = cleanCardName(alert.card_name, alert.card_id);
  const art = artLabel(alert);
  return { card, art, full: alert.is_alt ? `${card} · ${art}` : card };
}

function useDeleteAlert(alert: PriceAlert, remove: ReturnType<typeof useAlertActions>["remove"]) {
  const { confirm, confirmDialog } = useConfirm();
  const ask = async (): Promise<boolean> => {
    const { full } = alertNames(alert);
    const ok = await confirm({
      title: "Delete this alert?",
      message: `You will stop hearing about ${full}. This can't be undone.`,
      confirmLabel: "Delete",
    });
    if (ok) remove.mutate(alert.id);
    return ok;
  };
  return { ask, confirmDialog };
}

function AlertEditDialog({ alert, emailEnabled, onClose }: { alert: PriceAlert; emailEnabled: boolean; onClose: () => void }) {
  const { patch, remove } = useAlertActions();
  const { ask, confirmDialog } = useDeleteAlert(alert, remove);
  const { card, art } = alertNames(alert);
  return (
    <Dialog open onClose={onClose} className="alert-dialog" panelClassName="alert-dialog-panel" label={`Edit price alert for ${card}`}>
      <div className="alert-dialog-head">
        <div>
          <p className="eyebrow">{alert.card_id}</p>
          <h2>{card}</h2>
          <p className="muted alert-dialog-art">{art}</p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <AlertForm
        cardId={alert.card_id}
        productId={alert.product_id}
        price={alert.current_price}
        existing={alert}
        emailEnabled={emailEnabled}
        onSaved={onClose}
      />
      <div className="alert-dialog-more">
        <button
          type="button"
          className="btn secondary alert-dlg-act"
          disabled={patch.isPending}
          onClick={() => patch.mutate({ id: alert.id, patch: { paused: !alert.paused } }, { onSuccess: onClose })}
        >
          {alert.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="btn secondary danger alert-dlg-act"
          disabled={remove.isPending}
          onClick={async () => {
            if (await ask()) onClose();
          }}
        >
          Delete
        </button>
      </div>
      {confirmDialog}
    </Dialog>
  );
}

function AlertRow({ alert, emailEnabled }: { alert: PriceAlert; emailEnabled: boolean }) {
  const { patch, remove } = useAlertActions();
  const [target, setTarget] = useState(alert.target_price.toFixed(2));
  const [editing, setEditing] = useState(false);
  useEffect(() => setTarget(alert.target_price.toFixed(2)), [alert.target_price]);
  const status = alertStatus(alert);
  const busy = patch.isPending || remove.isPending;
  const parsed = parseTarget(target);
  const { ask, confirmDialog } = useDeleteAlert(alert, remove);
  const { card, art, full } = alertNames(alert);
  const distance = alertDistance(alert);
  const lastHit = lastHitLine(alert);
  const showBuy = status.tone === "hit" || status.tone === "met";
  const sign = alert.direction === "below" ? "\u2264" : "\u2265";

  function commitTarget() {
    if (parsed == null) return setTarget(alert.target_price.toFixed(2));
    if (parsed !== alert.target_price) patch.mutate({ id: alert.id, patch: { target_price: parsed } });
  }

  return (
    <li className={`alert-row tone-${status.tone}${alert.paused ? " paused" : ""}`} data-alert-id={alert.id}>
      <div className="alert-art">
        <CardThumb src={alert.image_url || undefined} cardId={alert.card_id} alt={full} productId={alert.product_id} />
      </div>
      <div className="alert-card">
        <div className="card-id">{alert.card_id}</div>
        <Link className="alert-card-name" to={`/cards/${encodeURIComponent(alert.card_id)}`}>
          {card}
        </Link>
        <div className="muted alert-card-art">{art}</div>
        <span className={`alert-chip ${status.tone}`}>{status.label}</span>
        {lastHit ? <div className="muted alert-lasthit">{lastHit}</div> : null}
      </div>
      <div className="alert-now">
        {alert.tcgplayer_url ? (
          <a href={alert.tcgplayer_url} target="_blank" rel="noreferrer" className="alert-now-price">
            {money(alert.current_price)}
          </a>
        ) : (
          <span className="alert-now-price">{money(alert.current_price)}</span>
        )}
        {distance ? (
          <span className={`muted alert-distance${distance.atTarget ? " at" : ""}`}>
            {distance.text.split(" · ").map((part, i) => (
              <span key={i}>
                {i > 0 ? " · " : null}
                <span className="alert-distance-part">{part}</span>
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div className="alert-target">
        <span className="alert-target-text">
          {sign} {money(alert.target_price)}
        </span>
        <div className="alert-target-controls">
          <DirectionToggle
            value={alert.direction}
            onChange={(direction) => patch.mutate({ id: alert.id, patch: { direction } })}
            label={`Direction for ${full}`}
            disabled={busy}
          />
          <TargetInput
            value={target}
            label={`Target price for ${full}`}
            onChange={setTarget}
            onBlur={commitTarget}
          />
        </div>
      </div>
      <div className="alert-toggles">
        <EmailCheck
          checked={alert.notify_email}
          emailEnabled={emailEnabled}
          disabled={busy}
          onChange={(v) => patch.mutate({ id: alert.id, patch: { notify_email: v } })}
        />
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
        {showBuy ? <BuyButton alert={alert} /> : null}
        <button
          type="button"
          className="btn secondary alert-act alert-act-pause"
          disabled={busy}
          onClick={() => patch.mutate({ id: alert.id, patch: { paused: !alert.paused } })}
        >
          {alert.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="btn secondary danger alert-act alert-act-delete"
          disabled={busy}
          aria-label={`Delete alert for ${full}`}
          onClick={() => void ask()}
        >
          Delete
        </button>
      </div>
      <button type="button" className="btn secondary alert-edit" aria-label={`Edit alert for ${full}`} onClick={() => setEditing(true)}>
        Edit
      </button>
      {patch.isError || remove.isError ? (
        <p className="error alert-row-error">{((patch.error ?? remove.error) as Error).message}</p>
      ) : null}
      {editing ? <AlertEditDialog alert={alert} emailEnabled={emailEnabled} onClose={() => setEditing(false)} /> : null}
      {confirmDialog}
    </li>
  );
}

function GhostRow({ onWatch }: { onWatch: () => void }) {
  return (
    <div className="alerts-empty">
      <div className="alert-row ghost-row" aria-hidden="true">
        <div className="alert-art">
          <div className="ghost-art" />
        </div>
        <div className="alert-card">
          <div className="alert-card-name">Monkey.D.Luffy</div>
          <div className="muted alert-card-art">Super Alternate Art</div>
          <span className="alert-chip watching">Watching</span>
        </div>
        <div className="alert-now">
          <span className="alert-now-price">$212.40</span>
          <span className="muted alert-distance">$22.40 above target · 11% to go</span>
        </div>
        <div className="alert-target">
          <span className="alert-target-text">{"\u2264"} $190.00</span>
          <div className="alert-target-controls">
            <div className="alert-dir">
              <span className="alert-dir-btn on">Drops to</span>
              <span className="alert-dir-btn">Rises to</span>
            </div>
            <span className="alert-money">$ 190.00</span>
          </div>
        </div>
      </div>
      <h2>No alerts yet</h2>
      <p className="muted">
        Watch a card and we tell you when its TCGPlayer price drops or rises to your target. Alt arts are
        tracked separately from the base art.
      </p>
      <button type="button" className="btn primary alert-empty-btn" onClick={onWatch}>
        Watch a card
      </button>
    </div>
  );
}

export function PriceAlertsPage({
  renderSearch,
}: {
  renderSearch: (renderAction: (card: CatalogCardResult) => ReactNode) => ReactNode;
}) {
  const alertsQ = usePriceAlerts();
  const [watching, setWatching] = useState<CatalogCardResult | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const alerts = alertsQ.data?.alerts ?? [];
  const emailEnabled = alertsQ.data?.email_enabled ?? false;
  const groups = groupAlerts(alerts);
  const hitLine = recentHitLine(recentHitCount(alerts));

  function openSearch() {
    const wrap = pageRef.current?.querySelector(".alerts-add");
    const toggle = wrap?.querySelector<HTMLButtonElement>(".filter-drawer-toggle");
    if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    window.setTimeout(() => {
      const input = wrap?.querySelector<HTMLInputElement>("input[type=search]");
      input?.focus();
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  }

  return (
    <section className="alerts-page" ref={pageRef}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Price alerts</p>
          <h1>Alerts</h1>
          <p className="muted alerts-explainer">
            Get told when a card's TCGPlayer market price hits your target. Checked when prices update: hourly
            for new sets, daily for the rest.
          </p>
          {hitLine ? <p className="alerts-hits">{hitLine}</p> : null}
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
      {alertsQ.data && alerts.length === 0 ? <GhostRow onWatch={openSearch} /> : null}
      {alerts.length > 0 ? (
        <div className="alert-lists">
          <div className="alert-row alert-colhead" aria-hidden="true">
            <span />
            <span>Card</span>
            <span>Market</span>
            <span>Alert me when price is</span>
            <span>Notify</span>
            <span />
          </div>
          {groups.map((g) => (
            <section key={g.key} className="alert-group" aria-label={g.title}>
              <h2 className="alert-group-title">
                {g.title} <span className="alert-group-count">{g.alerts.length}</span>
              </h2>
              <ul className="alert-list">
                {g.alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} emailEnabled={emailEnabled} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {watching ? <WatchDialog card={watching} onClose={() => setWatching(null)} /> : null}
    </section>
  );
}

export function BellBadge({ unread }: { unread: number }) {
  if (unread <= 0) return null;
  return (
    <span className="bell-badge" aria-hidden="true">
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function BellPanel({ items, close }: { items: AppNotification[]; close: () => void }) {
  const qc = useQueryClient();
  const read = useMutation({
    mutationFn: (ids?: number[]) => api.markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications() }),
  });
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

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications(),
    queryFn: () => api.notifications(30),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function NotificationsBell() {
  const q = useNotifications();
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
        style={{ width: "min(22.5rem, calc(100vw - 16px))" }}
      >
        {({ close }: { close: () => void }) => <BellPanel items={q.data?.items ?? []} close={close} />}
      </PopoverPanel>
    </Popover>
  );
}
