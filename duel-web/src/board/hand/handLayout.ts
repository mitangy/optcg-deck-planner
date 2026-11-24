export function usesPhoneFan(wide: boolean, handLayout: string): boolean {
  return !wide && handLayout !== "grid";
}

export function usesRailHand(wide: boolean, landscapePhone: boolean, tall: boolean, fanHand: boolean): boolean {
  return wide && !fanHand && (landscapePhone || tall);
}

// Automatic and Grid keep the hand in the right column, which has room for it there.
export function usesSidewaysFan(landscapePhone: boolean, tallEnough: boolean, handLayoutPref: string): boolean {
  return landscapePhone && tallEnough && handLayoutPref === "fan";
}

export function usesWideFan(
  wide: boolean,
  landscapePhone: boolean,
  sidewaysFan: boolean,
  specFans: SpectatorFans | null,
  handLayout: string,
): boolean {
  if (!wide) return false;
  if (landscapePhone) return sidewaysFan && specFans == null;
  return specFans != null || handLayout !== "grid";
}

export type SpectatorFans = "desktop" | "portrait" | "landscape";

export function spectatorFans(revealed: boolean, wide: boolean, landscapePhone: boolean): SpectatorFans | null {
  if (!revealed) return null;
  if (!wide) return "portrait";
  return landscapePhone ? "landscape" : "desktop";
}

export function spectatorHandGrid(fans: SpectatorFans | null): boolean {
  return fans === "portrait" || fans === "landscape";
}
