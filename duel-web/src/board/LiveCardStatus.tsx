import type { PreviewLive } from "./cardPreview";
import { formatPowerDelta, powerBreakdown } from "./powerDisplay";

/** Current power + active statuses for an in-play card (preview panel / inspect). */
export function LiveCardStatus({
  live,
  atlasPower,
  className,
}: {
  live: PreviewLive;
  atlasPower?: number;
  className?: string;
}) {
  const pb = powerBreakdown(live.power, live.printedPower, atlasPower);
  const labels = [...(live.statusLabels ?? [])];
  if (live.rested && !labels.includes("Rested")) labels.unshift("Rested");
  const don = live.attachedDonCount ?? 0;

  return (
    <div className={`live-status${className ? ` ${className}` : ""}`} aria-label="In-play status">
      {pb ? (
        <p className="live-status-power">
          <span className="live-status-power-label">Power</span>
          <strong className="live-status-power-value">{pb.current}</strong>
          {pb.delta !== 0 ? (
            <span className="live-status-power-detail">
              {pb.base} base{" "}
              <span className={pb.delta > 0 ? "power-mod-up" : "power-mod-down"}>
                {formatPowerDelta(pb.delta)}
              </span>
            </span>
          ) : null}
        </p>
      ) : null}
      {labels.length || don ? (
        <ul className="live-status-chips">
          {don ? <li className="live-status-chip live-status-chip-don">DON!! ×{don}</li> : null}
          {labels.map((l) => (
            <li key={l} className="live-status-chip">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="live-status-none">No active effects.</p>
      )}
    </div>
  );
}
