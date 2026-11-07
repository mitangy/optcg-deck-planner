import type { CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import type { HandDrawer } from "./handFanGeometry";
import type { FanPos } from "./handFanPos";

/** Where the fan sits: the board column's edge, the corner of a cut column, or dragged somewhere. */
export type HandFanSpot = "center" | "corner" | "float" | "docked";

/**
 * The desktop fanned hand: the player's fan, and a spectator's near and far fans.
 * Markup only; DuelBoard owns the state and passes the cards and the head row.
 * `edge="top"` is the mirror for the far hand, hanging from the top of the board.
 */
export function HandFan({
  rootRef,
  cardsRef,
  spot,
  edge = "bottom",
  drawer,
  tucking = false,
  moving = false,
  dragging = false,
  hoverUp,
  onHoverUp,
  count,
  cornerCut,
  pos,
  ariaLabel,
  inert,
  onClick,
  onLeave,
  head,
  children,
}: {
  rootRef?: Ref<HTMLDivElement>;
  cardsRef?: Ref<HTMLDivElement>;
  spot: HandFanSpot;
  edge?: "bottom" | "top";
  drawer: HandDrawer;
  /** Just tucked under the pointer: stays down until the pointer leaves once. */
  tucking?: boolean;
  /** Its grip is being dragged. */
  moving?: boolean;
  /** A card is being dragged out of it. */
  dragging?: boolean;
  hoverUp: boolean;
  onHoverUp: (up: boolean) => void;
  count: number;
  cornerCut?: number;
  /** Where it was dragged (the float / docked spots). */
  pos?: FanPos | null;
  ariaLabel: string;
  inert?: boolean;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /** The pointer left the whole fan (hover-up is already cleared). */
  onLeave?: () => void;
  head: ReactNode;
  children: ReactNode;
}) {
  const spotClass =
    spot === "corner"
      ? "hand-fan-corner"
      : spot === "center"
        ? "hand-fan-center"
        : spot === "float"
          ? "hand-fan-free hand-fan-float"
          : "hand-fan-free hand-fan-docked";
  const drawerClass = drawer === "open" ? " is-open" : drawer === "hidden" ? " is-hidden" : tucking ? " is-tucking" : "";
  return (
    <div
      ref={rootRef}
      className={`hand-fan ${spotClass}${edge === "top" ? " hand-fan-top" : ""}${moving ? " is-moving" : ""}${drawerClass}${dragging ? " is-dragging" : ""}${hoverUp ? " is-hover-up" : ""}`}
      style={
        {
          "--n": Math.max(count, 1),
          ...(cornerCut != null ? { "--corner-cut": cornerCut } : null),
          ...(pos ? { "--fan-x": pos.x, "--fan-y": pos.y } : null),
        } as CSSProperties
      }
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerLeave={() => {
        onHoverUp(false);
        onLeave?.();
      }}
    >
      <div className="hand-fan-head">{head}</div>
      <div
        className="hand-fan-cards"
        ref={cardsRef}
        inert={inert || undefined}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") onHoverUp(true);
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== "touch" && !hoverUp) onHoverUp(true);
        }}
      >
        {children}
      </div>
    </div>
  );
}
