import { useEffect, useState } from "react";
import { actionKeyTags } from "../input/hotkeys";
import { intentLabel } from "./intentLabel";
import type { Intent, PlayerView } from "../../net/protocol";
import { ConfirmButton } from "./ConfirmButton";
import { useClickCopy } from "../input/clickCopy";
import { dockAnchor, sameAnchor, stripReserve, type DockAnchor } from "../layout/dockAnchor";
import type { WaitingOnOpponent } from "../match/waitingOnOpponent";
import { useDuelSettings } from "../../settings";

export function intentBtnClass(intent: Intent): string {
  if (intent.type === "end_turn") return "intent-btn intent-btn-end";
  if (intent.type === "pass_counter" || intent.type === "pass_block") {
    return "intent-btn intent-btn-pass";
  }
  if (intent.type !== "mulligan") return "intent-btn";
  return intent.doMulligan ? "intent-btn intent-btn-mulligan" : "intent-btn intent-btn-end intent-btn-keep";
}

type ButtonProps = {
  primary: Intent;
  view?: PlayerView;
  disabled?: boolean;
  confirmEndTurn?: { reason: string | null } | null;
  defend?: { label: string; onPress?: () => void; warn?: boolean };
  counterLabel?: string;
  onSend: (intent: Intent) => void;
};

export function PrimaryActionButton({
  primary,
  view,
  disabled,
  confirmEndTurn = null,
  defend,
  counterLabel,
  onSend,
}: ButtonProps) {
  const copy = useClickCopy();
  if (primary.type === "end_turn" && confirmEndTurn) {
    return (
      <ConfirmButton
        className={`${intentBtnClass(primary)} intent-btn-primary`}
        label={intentLabel(primary, view)}
        confirmLabel={
          confirmEndTurn.reason ? (
            <>
              <span className="end-warn-full">End turn? {confirmEndTurn.reason}</span>
              <span className="end-warn-short">{copy("Tap again to end")}</span>
            </>
          ) : (
            copy("Tap again to end")
          )
        }
        title={
          confirmEndTurn.reason
            ? copy(`${confirmEndTurn.reason}. Tap again to end your turn.`)
            : copy("Ends your turn after a second tap")
        }
        disabled={disabled}
        reserveWidth
        onConfirm={() => onSend(primary)}
      />
    );
  }
  return (
    <button
      type="button"
      className={`${intentBtnClass(primary)} intent-btn-primary${defend?.warn ? " intent-btn-warn" : ""}`}
      disabled={disabled}
      onClick={() => (defend?.onPress ? defend.onPress() : onSend(primary))}
    >
      {defend
        ? defend.label
        : primary.type === "pass_counter" && counterLabel
          ? counterLabel
          : intentLabel(primary, view)}
    </button>
  );
}

export function WaitingIndicator({ waiting }: { waiting: WaitingOnOpponent }) {
  return (
    <div
      className={`waiting-opp waiting-opp-${waiting.kind}${waiting.urgent ? " is-urgent" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="waiting-opp-dot" aria-hidden />
      <span className="waiting-opp-text">
        <strong>{waiting.title}</strong>
        <span>{waiting.detail}{waiting.urgent ? "…" : ""}</span>
      </span>
    </div>
  );
}

// Also tells the strip how much of its right side the dock covers, so the battle text ends before the button instead of under it.
function useDockAnchor(enabled: boolean): DockAnchor | null {
  const [anchor, setAnchor] = useState<DockAnchor | null>(null);
  useEffect(() => {
    const midEl = () => document.querySelector<HTMLElement>(".board-root .midline");
    if (!enabled) {
      setAnchor(null);
      return;
    }
    let raf = 0;
    let last: DockAnchor | null = null;
    let reserve = "";
    const tick = () => {
      const rect = (sel: string) =>
        document.querySelector<HTMLElement>(`.board-root ${sel}`)?.getBoundingClientRect() ?? null;
      const mid = rect(".midline");
      const next = dockAnchor(mid, [rect(".side-you"), rect(".playmat")]);
      if (!sameAnchor(next, last)) {
        last = next;
        setAnchor(next);
      }
      if (next && mid) {
        const dockW =
          document.querySelector<HTMLElement>(".board-root .primary-dock")?.offsetWidth ||
          13 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
        const px = `${Math.round(stripReserve(mid, next.x, dockW))}px`;
        if (px !== reserve) {
          reserve = px;
          midEl()?.style.setProperty("--dock-reserve", px);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      window.cancelAnimationFrame(raf);
      midEl()?.style.removeProperty("--dock-reserve");
    };
  }, [enabled]);
  return anchor;
}

type DockProps = Omit<ButtonProps, "primary"> & {
  primary: Intent | null;
  extras?: Intent[];
  keyOffset?: number;
  waiting: WaitingOnOpponent | null;
  inline?: boolean;
};

// Other phase-wide actions sit on its left so the primary never moves.
export function PrimaryDock({ primary, extras = [], keyOffset = 0, waiting, inline = false, ...button }: DockProps) {
  const show = primary != null || extras.length > 0 || waiting != null;
  const anchor = useDockAnchor(show && !inline);
  const showKeyTags = useDuelSettings().shortcutTags;
  if (inline ? false : !show || !anchor) return null;
  const tags = actionKeyTags(extras, keyOffset);
  return (
    <div
      className={`primary-dock${inline ? " primary-dock-inline" : ""}${primary ? " has-primary" : ""}${
        extras.length > 0 ? " has-extras" : ""
      }${showKeyTags ? "" : " no-key-tag"}`}
      style={inline || !anchor ? undefined : { left: anchor.x, top: anchor.y }}
    >
      {extras.map((intent, i) => (
        <button
          key={`${intent.type}-${i}`}
          type="button"
          className={`${intentBtnClass(intent)} dock-extra`}
          disabled={button.disabled}
          data-key-num={tags[i]!.num ?? undefined}
          data-key-letter={tags[i]!.letter ?? undefined}
          data-key-tag={(showKeyTags && tags[i]!.tag) || undefined}
          onClick={() => button.onSend(intent)}
        >
          {intentLabel(intent, button.view)}
        </button>
      ))}
      {primary ? (
        <div className="primary-dock-main">
          <PrimaryActionButton primary={primary} {...button} />
        </div>
      ) : waiting && extras.length === 0 ? (
        <div className="primary-dock-main">
          <WaitingIndicator waiting={waiting} />
        </div>
      ) : null}
    </div>
  );
}
