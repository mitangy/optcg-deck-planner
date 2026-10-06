import type { CSSProperties, ReactNode, Ref } from "react";
import type { Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { fanPose } from "./handFan";
import { HandLabel } from "./HandLabel";
import type { FanPos } from "./handFanPos";
import { SPECTATOR_FAN_SPREAD, spectatorFarStrip, type SpectatorFans } from "./handLayout";

type HandCard = { id: string; defId: string };

/**
 * The far player's hand for a spectator of an unranked room: a fan hanging from
 * the top of the board (a mirror of the near fan: the middle card sits lowest,
 * the outer cards lean out and sit higher, every card upright). Desktop and
 * portrait phones put it in the row above the top mat, landscape phones at the
 * top of the right column.
 */
export function SpectatorFarHand({
  cards,
  ownerSeat,
  mode,
  name,
  motionIds = false,
  grip,
  pos = null,
  moving = false,
  rootRef,
}: {
  cards: readonly HandCard[];
  ownerSeat: Seat;
  mode: SpectatorFans;
  /** "Player 2": the label reads "Player 2 hand" */
  name: string;
  /** Tag the tiles for the draw / play animations (they find hand cards by id). */
  motionIds?: boolean;
  /** Desktop: the drag handle, left of the label. */
  grip?: ReactNode;
  /** Desktop: where it was dragged (floats there, fully shown); null = hanging from the top of the board. */
  pos?: FanPos | null;
  /** Being dragged right now. */
  moving?: boolean;
  rootRef?: Ref<HTMLElement>;
}) {
  const n = cards.length;
  // A hand too big to read overlapped scrolls in a row on a portrait phone.
  const scroll = mode === "portrait" && spectatorFarStrip(n) === "scroll";
  return (
    <section
      ref={rootRef}
      className={`spec-far spec-far-${mode}${pos ? " spec-far-float" : ""}${moving ? " is-moving" : ""}${grip ? " has-grip" : ""}`}
      style={
        {
          "--n": Math.max(n, 1),
          "--spec-spread": SPECTATOR_FAN_SPREAD,
          ...(pos ? { "--fan-x": pos.x, "--fan-y": pos.y } : null),
        } as CSSProperties
      }
      aria-label={`${name} hand: ${n} cards`}
    >
      <HandLabel name={name} count={n} grip={grip} />
      <div className={`spec-far-cards${scroll ? " spec-far-scroll" : ""}`}>
        {cards.map((c, i) => {
          const p = fanPose(i, n);
          return (
            <CardTile
              key={c.id}
              motionId={motionIds ? c.id : undefined}
              defId={c.defId}
              ownerSeat={ownerSeat}
              inspectOnClick
              style={
                scroll ? undefined : ({ "--rot": `${p.rot.toFixed(2)}deg`, "--drop": p.drop.toFixed(4) } as CSSProperties)
              }
            />
          );
        })}
      </div>
    </section>
  );
}
