/**
 * Landscape phone sizes: the right column and the Battle log / Chat overlay
 * drag wider or narrower (`panelSizesPhone`, device only). Format `R=220;O=320`
 * (px). "" = both at their default width.
 */
export type PhoneSizes = { rail?: number; overlay?: number };
export type PhoneTarget = "rail" | "overlay";

export const RAIL_MIN_PX = 140;
export const RAIL_MAX_PX = 360;
export const RAIL_MAX_VW = 45;
export const OVERLAY_MIN_PX = 220;
export const OVERLAY_MAX_PX = 560;
export const OVERLAY_MAX_VW = 75;
export const PHONE_STEP_PX = 16;

const LIMITS = {
  rail: { min: RAIL_MIN_PX, max: RAIL_MAX_PX, vw: RAIL_MAX_VW },
  overlay: { min: OVERLAY_MIN_PX, max: OVERLAY_MAX_PX, vw: OVERLAY_MAX_VW },
} as const;

/** The widest `target` goes in a window `vw` px wide (never under its minimum). */
export function phoneMaxPx(target: PhoneTarget, vw: number): number {
  const l = LIMITS[target];
  return Math.max(l.min, Math.min(l.max, (vw * l.vw) / 100));
}

export function clampPhoneWidth(target: PhoneTarget, px: number, vw: number): number {
  return Math.round(Math.min(phoneMaxPx(target, vw), Math.max(LIMITS[target].min, px)));
}

/** Keyboard step: `grow` widens. */
export function nudgePhoneWidth(target: PhoneTarget, px: number, grow: boolean, vw: number): number {
  return clampPhoneWidth(target, px + (grow ? PHONE_STEP_PX : -PHONE_STEP_PX), vw);
}

/** CSS value for a saved width: re-clamped by the browser so a rotated or resized window never overflows. */
export function phoneClampCss(target: PhoneTarget, px: number): string {
  const l = LIMITS[target];
  return `clamp(${l.min}px, ${px}px, max(${l.min}px, min(${l.max}px, ${l.vw}vw)))`;
}

/** Read a saved string; junk and out-of-range values are dropped. */
export function parsePhoneSizes(saved: string): PhoneSizes {
  const out: PhoneSizes = {};
  for (const token of saved.split(";")) {
    const m = /^([RO])=(\d+(?:\.\d+)?)$/.exec(token.trim());
    if (!m) continue;
    const target: PhoneTarget = m[1] === "R" ? "rail" : "overlay";
    const px = Number(m[2]);
    if (px >= LIMITS[target].min && px <= LIMITS[target].max) out[target] = px;
  }
  return out;
}

export function serializePhoneSizes(s: PhoneSizes): string {
  const parts: string[] = [];
  if (s.rail != null) parts.push(`R=${Math.round(s.rail)}`);
  if (s.overlay != null) parts.push(`O=${Math.round(s.overlay)}`);
  return parts.join(";");
}

export function setPhoneWidth(s: PhoneSizes, target: PhoneTarget, px: number | null): PhoneSizes {
  const next = { ...s };
  if (px == null) delete next[target];
  else next[target] = px;
  return next;
}
