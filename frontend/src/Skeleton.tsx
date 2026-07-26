import type { CSSProperties, ReactNode } from "react";

/** Soft bone block that breathes while content loads. */
export function Skeleton({
  className = "",
  style,
  ariaHidden = true,
}: {
  className?: string;
  style?: CSSProperties;
  ariaHidden?: boolean;
}) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden={ariaHidden} />;
}

function SkeletonScreen({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="skeleton-screen" aria-busy="true" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {children}
    </section>
  );
}

export function AuthLoadingSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="skeleton-auth" aria-busy="true" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-auth-card">
        <Skeleton className="skeleton-logo" />
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-line skeleton-line-md" />
        <Skeleton className="skeleton-btn" />
      </div>
    </div>
  );
}

export function ShoppingListSkeleton() {
  return (
    <SkeletonScreen label="Loading shopping list…">
      <div className="page-head">
        <div className="skeleton-stack">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line skeleton-line-lg" />
        </div>
        <Skeleton className="skeleton-btn skeleton-btn-sm" />
      </div>
      <Skeleton className="skeleton-drawer" />
      <div className="skeleton-toolbar">
        <Skeleton className="skeleton-search" />
        <Skeleton className="skeleton-toggle" />
      </div>
      <Skeleton className="skeleton-drawer" />
      <div className="skeleton-card-list skeleton-desktop-rows">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton-row-card">
            <Skeleton className="skeleton-thumb" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
            <Skeleton className="skeleton-chip" />
          </div>
        ))}
      </div>
      <div className="skeleton-mobile-cards">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-mobile-card">
            <Skeleton className="skeleton-thumb skeleton-thumb-lg" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

export function DecksListSkeleton() {
  return (
    <SkeletonScreen label="Loading decks…">
      <div className="page-head">
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-btn skeleton-btn-sm" />
      </div>
      <div className="deck-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-deck-card">
            <div className="skeleton-deck-card-main">
              <Skeleton className="skeleton-thumb" />
              <div className="skeleton-stack skeleton-stack-grow">
                <Skeleton className="skeleton-line skeleton-line-md" />
                <Skeleton className="skeleton-line skeleton-line-sm" />
                <Skeleton className="skeleton-line skeleton-line-sm" />
              </div>
            </div>
            <div className="skeleton-deck-actions">
              <Skeleton className="skeleton-line skeleton-line-xs" />
              <Skeleton className="skeleton-line skeleton-line-xs" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

export function DeckDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading deck…">
      <div className="page-head">
        <div className="skeleton-stack">
          <Skeleton className="skeleton-line skeleton-line-xs" />
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line skeleton-line-md" />
          <Skeleton className="skeleton-line skeleton-line-sm" />
        </div>
        <div className="page-head-actions">
          <Skeleton className="skeleton-btn skeleton-btn-sm" />
          <Skeleton className="skeleton-btn skeleton-btn-sm" />
        </div>
      </div>
      <Skeleton className="skeleton-drawer" />
      <Skeleton className="skeleton-progress" />
      <div className="skeleton-toolbar">
        <Skeleton className="skeleton-search" />
        <Skeleton className="skeleton-toggle" />
      </div>
      <Skeleton className="skeleton-drawer" />
      <div className="skeleton-card-list skeleton-desktop-rows">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton-row-card">
            <Skeleton className="skeleton-thumb" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
            <Skeleton className="skeleton-chip" />
            <Skeleton className="skeleton-chip" />
          </div>
        ))}
      </div>
      <div className="skeleton-mobile-cards">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton-mobile-card">
            <Skeleton className="skeleton-thumb skeleton-thumb-lg" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

export function GroupBuysListSkeleton() {
  return (
    <SkeletonScreen label="Loading group buys…">
      <div className="page-head">
        <div className="skeleton-stack">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line skeleton-line-lg" />
        </div>
      </div>
      <div className="skeleton-create-row">
        <Skeleton className="skeleton-search" />
        <Skeleton className="skeleton-btn skeleton-btn-sm" />
      </div>
      <div className="skeleton-gb-list">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton-gb-card">
            <div className="skeleton-gb-card-top">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-xs" />
            </div>
            <Skeleton className="skeleton-line skeleton-line-sm" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

export function GroupBuyDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading group buy…">
      <div className="page-head">
        <div className="skeleton-stack">
          <Skeleton className="skeleton-line skeleton-line-xs" />
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line skeleton-line-lg" />
        </div>
      </div>
      <div className="skeleton-gb-toolbar">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="skeleton-btn skeleton-btn-sm" />
        ))}
      </div>
      <Skeleton className="skeleton-line skeleton-line-md" />
      <div className="skeleton-card-list">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton-row-card">
            <Skeleton className="skeleton-thumb" />
            <div className="skeleton-stack skeleton-stack-grow">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
            <Skeleton className="skeleton-chip" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

export function InlineSkeleton({
  lines = 2,
  label = "Loading…",
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div className="skeleton-inline" aria-busy="true" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`skeleton-line ${i === 0 ? "skeleton-line-md" : "skeleton-line-sm"}`}
        />
      ))}
    </div>
  );
}
