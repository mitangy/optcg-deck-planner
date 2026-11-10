import { Select } from "@optcg/ui/popups";
import { usePageMeta } from "@optcg/ui/seo";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money, type CardPageFinish, type CardPageLeader, type CardPageResponse } from "../api";
import { cardFacts, leaderPlayLine, parseArt, parseDays, printingLabel, selectPrinting, usageHeadline } from "./cardPageModel";
import { loadCardRules } from "./cardRules";
import { CardArtImg, CardLightbox, useCardArt } from "../ui/CardThumb";
import { formatDeckRow, formatPercent, META_DAY_OPTIONS, META_DEFAULT_DAYS } from "../meta/meta";
import { PriceHistory } from "../prices/PriceHistory";
import { SITE_ORIGIN } from "../seo/routeMetaTable";
import { Skeleton } from "../ui/Skeleton";
import { qk } from "../cache/queryKeys";

const STALE_MS = 5 * 60_000;
const FALLBACK_SOURCE_URL = "https://play.limitlesstcg.com/tournaments/completed?game=OP";

/** The card's printed text, loaded on demand (its own chunk). Its box keeps one height class while loading. */
function RulesText({ cardId }: { cardId: string }) {
  const { data: rules } = useQuery({
    queryKey: qk.cardRules(cardId),
    queryFn: () => loadCardRules(cardId),
    staleTime: Infinity,
  });

  if (rules === undefined) {
    return (
      <div className="card-rules" aria-busy="true" aria-label="Loading card text">
        <Skeleton className="skeleton-line skeleton-line-md" />
        <Skeleton className="skeleton-line skeleton-line-md" />
        <Skeleton className="skeleton-line skeleton-line-sm" />
      </div>
    );
  }
  if (!rules) return null;
  const stats = [
    rules.power != null ? ["Power", String(rules.power)] : null,
    rules.counter ? ["Counter", `+${rules.counter}`] : null,
    rules.life != null ? ["Life", String(rules.life)] : null,
    rules.attributes.length ? ["Attribute", rules.attributes.join(" / ")] : null,
  ].filter((s): s is string[] => s !== null);
  return (
    <div className="card-rules">
      {stats.length > 0 && (
        <dl className="card-rules-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {rules.traits.length > 0 && <p className="card-rules-traits muted">{rules.traits.join(" / ")}</p>}
      {rules.text && <p className="card-rules-text">{rules.text}</p>}
      {rules.trigger && <p className="card-rules-text card-rules-trigger">{rules.trigger}</p>}
    </div>
  );
}

function LeaderThumb({ src, cardId }: { src?: string; cardId: string }) {
  return (
    <CardArtImg
      className="card-play-art"
      src={src}
      cardId={cardId}
      alt=""
      loading="lazy"
      decoding="async"
      width={40}
      height={56}
      fallback={<span className="card-play-art placeholder" />}
    />
  );
}

function PlayedBy({ leaders, days }: { leaders: CardPageLeader[]; days: number }) {
  const dayParam = days === META_DEFAULT_DAYS ? "" : `&days=${days}`;
  return (
    <section className="card-play-block" aria-label="Played by">
      <h3>Played by</h3>
      <ul className="card-play-list">
        {leaders.map((l) => (
          <li key={l.leader_id}>
            <Link className="card-play-row" to={`/meta?leader=${encodeURIComponent(l.leader_id)}${dayParam}`}>
              <LeaderThumb src={l.image_url} cardId={l.leader_id} />
              <span className="card-play-text">
                <span className="card-play-name">{l.name || l.leader_id}</span>
                <span className="muted card-play-sub">{leaderPlayLine(l)}</span>
              </span>
              <span className="card-play-copies">
                <strong>{l.average_copies.toFixed(1)}</strong>
                <span className="muted"> avg copies</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopFinishes({ decks }: { decks: CardPageFinish[] }) {
  return (
    <section className="card-play-block" aria-label="Top finishes">
      <h3>Top finishes</h3>
      <ul className="card-play-list">
        {decks.map((d) => (
          <li key={d.id} className="card-finish">
            <LeaderThumb src={d.leader_image_url} cardId={d.leader_id} />
            <span className="card-play-text">
              <a className="card-play-name" href={d.event_url} target="_blank" rel="noopener noreferrer">
                {d.event}
              </a>
              <span className="muted card-play-sub">
                {formatDeckRow(d)} · {d.leader_name || d.leader_id}
              </span>
            </span>
            <span className="card-play-copies">
              <strong>{d.copies}×</strong>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TournamentPlay({
  data,
  cardId,
  days,
  setDays,
  loading,
  error,
  retry,
}: {
  data: CardPageResponse | undefined;
  cardId: string;
  days: number;
  setDays: (d: number) => void;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const u = data?.usage;
  return (
    <section className="card-panel card-play" aria-label="Tournament play">
      <div className="card-panel-head">
        <h2>Tournament play</h2>
        <label className="meta-select">
          <span className="muted">Window</span>
          <Select
            value={days}
            onChange={setDays}
            options={META_DAY_OPTIONS.map((d) => ({ value: d, label: `Last ${d} days` }))}
          />
        </label>
      </div>
      {loading && (
        <div aria-busy="true" aria-label="Loading tournament play">
          <Skeleton className="card-play-headline-skel" />
          <Skeleton className="skeleton-line skeleton-line-md" />
          <Skeleton className="skeleton-line skeleton-line-md" />
        </div>
      )}
      {error && (
        <div className="meta-state">
          <p className="error">{error.message}</p>
          <button type="button" className="btn secondary" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {u && (
        <>
          <dl className="card-play-stats">
            <div>
              <dt>{u.is_leader ? "Meta share" : "In decks"}</dt>
              <dd>{u.total_decks ? formatPercent(u.rate) : "—"}</dd>
            </div>
            <div>
              <dt>{u.is_leader ? "Decks led" : "Decks"}</dt>
              <dd>{u.decks_with_card}</dd>
            </div>
            <div>
              <dt>{u.is_leader ? "All decks" : "Avg copies"}</dt>
              <dd>{u.is_leader ? u.total_decks.toLocaleString("en-US") : u.average_copies != null ? u.average_copies.toFixed(1) : "—"}</dd>
            </div>
          </dl>
          <p className="muted card-play-headline">
            {usageHeadline(u)} · {u.events} events
          </p>
          {u.is_leader && u.decks_with_card > 0 && (
            <Link className="btn secondary card-play-cta" to={`/meta?leader=${encodeURIComponent(cardId)}${days === META_DEFAULT_DAYS ? "" : `&days=${days}`}`}>
              See decks
            </Link>
          )}
          {u.leaders.length > 0 && <PlayedBy leaders={u.leaders} days={days} />}
          {u.top_decks.length > 0 && <TopFinishes decks={u.top_decks} />}
          {u.decks_with_card === 0 && u.total_decks > 0 && (
            <p className="muted">No tournament deck ran this card in the last {days} days.</p>
          )}
        </>
      )}
      <p className="muted meta-credit">
        Tournament data from{" "}
        <a href={u?.source_url || FALLBACK_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          Limitless TCG
        </a>
      </p>
    </section>
  );
}

function ArtPicker({
  data,
  productId,
  onPick,
}: {
  data: CardPageResponse;
  productId: number;
  onPick: (productId: number) => void;
}) {
  const { printings, card } = data;
  if (printings.length < 2) return null;
  return (
    <section className="card-panel" aria-label="Arts">
      <div className="card-panel-head">
        <h2>Arts</h2>
        <span className="muted">{printings.length} printings</span>
      </div>
      <ul className="card-arts">
        {printings.map((p, i) => {
          const id = i === 0 ? 0 : p.product_id;
          const pressed = id === productId;
          const label = printingLabel(p, i);
          return (
            <li key={p.product_id}>
              <button
                type="button"
                className={`card-art-btn${pressed ? " is-selected" : ""}`}
                aria-pressed={pressed}
                aria-label={`${label}${p.market_price != null ? `, ${money(p.market_price)}` : ""}`}
                onClick={() => onPick(id)}
              >
                <CardArtImg
                  className="card-art-thumb"
                  src={p.image_url || (i === 0 ? card.image_url : "")}
                  cardId={card.card_id}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  fallback={<span className="card-art-thumb placeholder" />}
                />
                <span className="card-art-label">{label}</span>
                <span className="card-art-price">{money(p.market_price)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CardNotFound({ cardId, error }: { cardId: string; error: Error & { status?: number } }) {
  const missing = error.status === 404;
  return (
    <section className="card-page card-page-state">
      <h1>{missing ? "Card not found" : "Could not load this card"}</h1>
      <p className="muted">
        {missing ? `We have no card ${cardId} in the catalog.` : error.message}
      </p>
      <Link className="btn secondary" to="/meta">
        Browse the meta
      </Link>
    </section>
  );
}

/**
 * `/cards/:cardId` (#953): one card's art, price history with the When to buy read, and tournament play.
 * `?art=<productId>` picks the printing (absent = base art); `?days=` the tournament window.
 * `renderActions` is given only to signed-in viewers: owned count, shopping list and price alert for the shown art.
 */
/** The header art; tap it for the full-size card (no actions: this page already has them). */
function HeadArt({ src, cardId, name, alt }: { src?: string | null; cardId: string; name: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const art = useCardArt(src, cardId, "large");
  if (!art.src) return <div className="card-head-img placeholder">No image</div>;
  return (
    <>
      <button type="button" className="card-head-btn" onClick={() => setOpen(true)} title="Expand card" aria-label={`Enlarge ${name}`}>
        <img className="card-head-img" src={art.src} alt={alt} onError={art.fail} />
      </button>
      {open ? <CardLightbox src={src} cardId={cardId} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function CardPage({ renderActions }: { renderActions?: (cardId: string, productId: number) => ReactNode }) {
  const { cardId: rawId = "" } = useParams();
  const cardId = rawId.toUpperCase();
  const [params, setParams] = useSearchParams();
  const art = parseArt(params.get("art"));
  const days = parseDays(params.get("days"));

  const q = useQuery({
    queryKey: qk.meta.card(cardId, days),
    queryFn: () => api.cardDetail(cardId, days),
    staleTime: STALE_MS,
    retry: false,
    placeholderData: (prev) => (prev?.card.card_id === cardId ? prev : undefined),
  });
  const data = q.data;
  const { printing, productId } = useMemo(() => selectPrinting(data?.printings ?? [], art), [data, art]);
  const card = data?.card;
  const image = printing?.image_url || card?.image_url;
  const price = printing?.market_price ?? card?.market_price ?? null;
  const tcgUrl = printing?.tcgplayer_url || card?.tcgplayer_url;

  usePageMeta({
    title: card ? `${card.name} (${card.card_id}) · OPTCG Deck Planner` : `${cardId} · OPTCG Deck Planner`,
    description: card ? `${card.name} (${card.card_id}): price history, when to buy and tournament play.` : undefined,
    path: `/cards/${cardId}`,
    origin: SITE_ORIGIN,
    noindex: true,
  });

  function update(next: { art?: number; days?: number }) {
    const p = new URLSearchParams(params);
    const a = next.art ?? art;
    const d = next.days ?? days;
    if (a > 0) p.set("art", String(a));
    else p.delete("art");
    if (d !== META_DEFAULT_DAYS) p.set("days", String(d));
    else p.delete("days");
    setParams(p, { replace: true });
  }

  if (q.error && !data) return <CardNotFound cardId={cardId} error={q.error as Error & { status?: number }} />;

  const artLabel = printing && data ? printingLabel(printing, data.printings.indexOf(printing)) : "";

  return (
    <section className="card-page">
      <header className="card-head">
        <div className="card-head-art">
          {card ? (
            <HeadArt src={image} cardId={card.card_id} name={card.name} alt={`${card.name} ${artLabel}`.trim()} />
          ) : (
            <Skeleton className="card-head-img" />
          )}
        </div>
        <div className="card-head-info">
          <p className="eyebrow">
            <Link to="/meta">Meta decks</Link> · Card
          </p>
          <h1>{card ? card.name : cardId}</h1>
          <p className="muted card-head-sub">
            {cardId}
            {card?.rarity ? ` · ${card.rarity}` : ""}
            {card?.group_name ? ` · ${card.group_name}` : ""}
          </p>
          {card ? (
            <ul className="card-facts">
              {cardFacts(card).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <Skeleton className="skeleton-line skeleton-line-md" />
          )}
          <div className="card-head-price">
            <div>
              <span className="muted card-head-price-label">Market{data && data.printings.length > 1 ? ` · ${artLabel}` : ""}</span>
              <strong className="card-head-price-value">{card ? money(price) : "—"}</strong>
            </div>
            {tcgUrl ? (
              <a className="btn secondary" href={tcgUrl} target="_blank" rel="noopener noreferrer">
                View on TCGPlayer
              </a>
            ) : null}
          </div>
          {card && <RulesText cardId={card.card_id} />}
          {renderActions && card ? <div className="card-actions">{renderActions(card.card_id, productId)}</div> : null}
        </div>
      </header>

      <div className="card-cols">
        <div className="card-col">
          {data && <ArtPicker data={data} productId={productId} onPick={(id) => update({ art: id })} />}
          <section className="card-panel card-price" aria-label="Price">
            <div className="card-panel-head">
              <h2>Price</h2>
            </div>
            {card ? <PriceHistory key={`${card.card_id}:${productId}`} cardId={card.card_id} productId={productId} /> : <Skeleton className="card-price-skel" />}
          </section>
        </div>
        <div className="card-col">
          <TournamentPlay
            data={data}
            cardId={cardId}
            days={days}
            setDays={(d) => update({ days: d })}
            loading={q.isPending}
            error={q.error as Error | null}
            retry={() => void q.refetch()}
          />
        </div>
      </div>
    </section>
  );
}
