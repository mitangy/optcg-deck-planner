import type { HTMLAttributes, ReactNode } from "react";
import { AltTrayContext, useWideGridAlts } from "../cards/AltTray";
import { MobileCardMedia, StackedThumb } from "./CardThumb";

type Root = Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

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
  copies,
  alts,
  altCount = 0,
  altsProps,
  children,
}: {
  cardId: string;
  name: string;
  imageSrc?: string;
  imageProductId?: number;
  alts?: ReactNode;
  altCount?: number;
  altsProps?: Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">;
  className?: string;
  as?: "article" | "div";
  dataCardId?: string;
  rootProps?: Root;
  before?: ReactNode;
  meta?: ReactNode;
  onMediaClick?: HTMLAttributes<HTMLDivElement>["onClick"];
  copies?: number;
  children?: ReactNode;
}) {
  const hasAlts = alts != null && alts !== false;
  const wideAlts = useWideGridAlts(altCount, hasAlts);
  const altsBox = hasAlts ? (
    <div className="grid-card-alts" {...altsProps}>
      {alts}
    </div>
  ) : null;
  return (
    <Tag
      {...rootProps}
      className={`grid-card${className ? ` ${className}` : ""}${wideAlts.className}`}
      data-card-id={dataCardId}
    >
      {before}
      <div className="grid-card-media" onClick={onMediaClick}>
        <StackedThumb copies={copies} src={imageSrc} cardId={cardId} alt={name} productId={imageProductId} />
      </div>
      <div className="grid-card-body">
        <div className="card-id">{cardId}</div>
        <div className="grid-card-name">{name}</div>
        {meta != null ? <div className="grid-card-meta muted">{meta}</div> : null}
        {children}
        {wideAlts.wide ? null : altsBox}
      </div>
      {wideAlts.wide && altsBox ? <AltTrayContext.Provider value={true}>{altsBox}</AltTrayContext.Provider> : null}
    </Tag>
  );
}

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
  copies,
  children,
}: {
  cardId: string;
  name: string;
  imageSrc?: string;
  imageProductId?: number;
  cost: number | string | null;
  rarity?: string;
  className?: string;
  dataCardId?: string;
  rootProps?: Root;
  before?: ReactNode;
  meta?: ReactNode;
  info?: ReactNode;
  mediaWrapProps?: Pick<HTMLAttributes<HTMLDivElement>, "onClick" | "onKeyDown">;
  copies?: number;
  children?: ReactNode;
}) {
  const media = (
    <MobileCardMedia src={imageSrc} productId={imageProductId} cardId={cardId} alt={name} cost={cost} rarity={rarity} copies={copies} />
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
