import type { DuelSettings } from "../settings";

/** Everything "Reset layout" puts back: side panels and their sizes, the player's fan, the pinned opponent hand, both spectator fans and where pop-ups open and the column they dock into. */
export const LAYOUT_RESET = {
  panelLayout: "",
  panelSizes: "",
  handFanPos: "",
  oppHandSpot: "",
  spectatorNearFanPos: "",
  spectatorFarFanPos: "",
  promptPos: "",
  promptDock: "",
} as const satisfies Partial<DuelSettings>;

/** True when anything in the layout has been moved from its default. */
export function layoutMoved(settings: Pick<DuelSettings, keyof typeof LAYOUT_RESET>): boolean {
  return (Object.keys(LAYOUT_RESET) as (keyof typeof LAYOUT_RESET)[]).some((k) => settings[k] !== LAYOUT_RESET[k]);
}
