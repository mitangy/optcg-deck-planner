type DonToken = { id: string; rested: boolean };

type Props = {
  /** Full cost-area tokens when known (your side). */
  tokens?: DonToken[];
  /** Aggregate counts when only public info (opponent). */
  activeCount?: number;
  totalCount?: number;
  side: "you" | "opp";
};

export function DonStrip({ tokens, activeCount, totalCount, side }: Props) {
  const items: DonToken[] =
    tokens ??
    Array.from({ length: totalCount ?? 0 }, (_, i) => ({
      id: `${side}-don-${i}`,
      rested: i >= (activeCount ?? 0),
    }));

  return (
    <div className={`don-strip don-strip-${side}`} aria-label={`${side} DON cost area`}>
      <div className="don-strip-label">
        <span>DON!!</span>
        <span className="don-strip-nums">
          {tokens
            ? `${tokens.filter((t) => !t.rested).length}/${tokens.length}`
            : `${activeCount ?? 0}/${totalCount ?? 0}`}
        </span>
      </div>
      <div className="don-strip-rail">
        {items.length === 0 ? (
          <span className="don-empty">Empty</span>
        ) : (
          items.map((t) => (
            <span
              key={t.id}
              className={`don-chip${t.rested ? " rested" : " active"}`}
              title={t.rested ? "Rested DON!!" : "Active DON!!"}
            />
          ))
        )}
      </div>
    </div>
  );
}
