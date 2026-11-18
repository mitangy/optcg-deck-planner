import type { CSSProperties, ReactNode } from "react";
import { stackLayerCount } from "./stack";
import "./cardStack.css";

export interface CardStackProps {
  count: number;
  copy: ReactNode | ((layer: number) => ReactNode);
  /** Always reserve the full space for the layers, so tiles in a row align and nothing shifts when the count changes. */
  reserve?: boolean;
  className?: string;
  children: ReactNode;
}

export function CardStack({ count, copy, reserve = false, className, children }: CardStackProps) {
  return (
    <div className={className ? `card-stack ${className}` : "card-stack"} data-reserve={reserve ? "true" : undefined}>
      {Array.from({ length: stackLayerCount(count) }, (_, i) => (
        <div key={i} className="card-stack-copy" aria-hidden="true" style={{ "--layer": i + 1 } as CSSProperties}>
          {typeof copy === "function" ? copy(i + 1) : copy}
        </div>
      ))}
      <div className="card-stack-front">{children}</div>
    </div>
  );
}
