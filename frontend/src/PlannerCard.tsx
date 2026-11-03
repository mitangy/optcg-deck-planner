import type { HTMLAttributes, ReactNode } from "react";
import { CardThumb, MobileCardMedia } from "./CardThumb";

type Root = Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

/**
 * The shared card container for grid view: media, then a body with the card id,
 * name and optional meta line. Every list page (deck, shopping, friends, group
 * buys, shares) renders its cards through this so they stay structurally alike.
 * Page-specific rows (price, owned steppers, alt arts…) go in `children`.
 */
export function GridCard({
  cardId,
  name,
  imageSrc,
  imageProductId,
  className = "",
  as: Tag = "article",
  dataCardId,
  rootProps,
  before,
  meta,
  onMediaClick,
  children,
}: {
  cardId: string;
  name: string;
  imageSrc?: string;
  /** Printing the main art shows (0 = base) so the lightbox price alert targets it. */
  imageProductId?: number;
  /** Extra classes after `grid-card` (e.g. `need`, `done`, `excluded`). */
  className?: string;
  /** `div` when an outer wrapper already is the article (Shopping's selectable wrapper). */
  as?: "article" | "div";
  dataCardId?: string;
  rootProps?: Root;
  /** Rendered first inside the card, e.g. a member colour rail. */
  before?: ReactNode;
  /** Muted line under the name; omitted when null/undefined. */
  meta?: ReactNode;
  onMediaClick?: HTMLAttributes<HTMLDivElement>["onClick"];
  children?: ReactNode;
}) {
  return (
    <Tag
      {...rootProps}
      className={`grid-card${className ? ` ${className}` : ""}`}
      data-card-id={dataCardId}
    >
      {before}
      <div className="grid-card-media" onClick={onMediaClick}>
        <CardThumb src={imageSrc} cardId={cardId} alt={name} productId={imageProductId} />
      </div>
      <div className="grid-card-body">
        <div className="card-id">{cardId}</div>
        <div className="grid-card-name">{name}</div>
        {meta != null ? <div className="grid-card-meta muted">{meta}</div> : null}
        {children}
      </div>
    </Tag>
  );
}

/**
 * The shared card container for the phone list: a top row with the card art
 * (cost + rarity) beside id, name, meta and `info`; `children` sit below it.
 */
export function MobileCard({
  cardId,
  name,
  imageSrc,
  imageProductId,
  cost,
  rarity,
  className = "",
  dataCardId,
  rootProps,
  before,
  meta,
  info,
  mediaWrapProps,
  children,
}: {
  cardId: string;
  name: string;
  imageSrc?: string;
  /** Printing the main art shows (0 = base) so the lightbox price alert targets it. */
  imageProductId?: number;
  cost: number | string | null;
  rarity?: string;
  /** Extra classes after `mobile-card` (e.g. `need`, `done`, `selectable`). */
  className?: string;
  dataCardId?: string;
  rootProps?: Root;
  before?: ReactNode;
  /** Meta line under the name; omitted when null/undefined. */
  meta?: ReactNode;
  /** Rows inside the info column below the meta (price row, claim notes…). */
  info?: ReactNode;
  /** Wraps the media in a div with these handlers (Shopping stops tap-to-select there). */
  mediaWrapProps?: Pick<HTMLAttributes<HTMLDivElement>, "onClick" | "onKeyDown">;
  children?: ReactNode;
}) {
  const media = (
    <MobileCardMedia src={imageSrc} productId={imageProductId} cardId={cardId} alt={name} cost={cost} rarity={rarity} />
  );
  return (
    <article
      {...rootProps}
      className={`mobile-card${className ? ` ${className}` : ""}`}
      data-card-id={dataCardId}
    >
      {before}
      <div className="mobile-card-top">
        {mediaWrapProps ? <div {...mediaWrapProps}>{media}</div> : media}
        <div className="mobile-card-info">
          <div className="card-id">{cardId}</div>
          <div className="mobile-card-name">{name}</div>
          {meta != null ? <div className="mobile-card-meta">{meta}</div> : null}
          {info}
        </div>
      </div>
      {children}
    </article>
  );
}
