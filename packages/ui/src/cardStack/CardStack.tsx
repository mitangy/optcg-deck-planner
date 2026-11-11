import type { CSSProperties, ReactNode } from "react";
import { stackLayerCount } from "./stack";
import "./cardStack.css";

export interface CardStackProps {
  /** Copies of the card; one layer is drawn behind the front card per extra copy, up to four cards. */
  count: number;
  /** What each layer behind the front card shows (the card art). */
  copy: ReactNode;
  /** Always reserve the full space for the layers, so tiles in a row align and nothing shifts when the count changes. */
  reserve?: boolean;
  className?: string;
  /** The front card. */
  children: ReactNode;
}

/** Copies of one card drawn as a pile peeking out up and to the right of the front card. */
export function CardStack({ count, copy, reserve = false, className, children }: CardStackProps) {
  return (
    <div className={className ? `card-stack ${className}` : "card-stack"} data-reserve={reserve ? "true" : undefined}>
      {Array.from({ length: stackLayerCount(count) }, (_, i) => (
        <div key={i} className="card-stack-copy" aria-hidden="true" style={{ "--layer": i + 1 } as CSSProperties}>
          {copy}
        </div>
      ))}
      <div className="card-stack-front">{children}</div>
    </div>
  );
}
