import type { DuelSettings } from "../../settings";

export const LAYOUT_RESET = {
  panelLayout: "",
  panelSizes: "",
  panelSizesBig: "",
  panelSizesPhone: "",
  handFanPos: "",
  oppHandSpot: "",
  spectatorNearFanPos: "",
  spectatorFarFanPos: "",
  promptPos: "",
  previewPopupPos: "",
  popupSize: 100,
  previewPopupSize: 100,
  promptDock: "",
} as const satisfies Partial<DuelSettings>;

export function layoutMoved(settings: Pick<DuelSettings, keyof typeof LAYOUT_RESET>): boolean {
  return (Object.keys(LAYOUT_RESET) as (keyof typeof LAYOUT_RESET)[]).some((k) => settings[k] !== LAYOUT_RESET[k]);
}
