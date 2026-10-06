import type { DuelSettings } from "../settings";

/** Everything "Reset layout" puts back: side panels, the player's fan, the pinned opponent hand and both spectator fans. */
export const LAYOUT_RESET = {
  panelLayout: "",
  handFanPos: "",
  oppHandSpot: "",
  spectatorNearFanPos: "",
  spectatorFarFanPos: "",
} as const satisfies Partial<DuelSettings>;

/** True when anything in the layout has been moved from its default. */
export function layoutMoved(settings: Pick<DuelSettings, keyof typeof LAYOUT_RESET>): boolean {
  return (Object.keys(LAYOUT_RESET) as (keyof typeof LAYOUT_RESET)[]).some((k) => settings[k] !== LAYOUT_RESET[k]);
}
