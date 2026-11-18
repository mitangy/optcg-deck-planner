import type { ReactNode } from "react";

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
