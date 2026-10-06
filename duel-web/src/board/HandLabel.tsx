import type { ReactNode } from "react";

/**
 * The label over a spectator's hand fan: "Seat1 hand 5". Both fans (near and
 * far, every layout) use this one component, so the two pills share a font,
 * padding and colours and only their position differs. `grip` is the drag
 * handle (desktop), which sits just before the pill.
 */
export function HandLabel({ name, count, grip }: { name: string; count: number; grip?: ReactNode }) {
  return (
    <div className="hand-label-head">
      {grip}
      <span className="hand-label">
        <span className="hand-label-name">{name} hand</span>
        <b className="hand-label-count">{count}</b>
      </span>
    </div>
  );
}
