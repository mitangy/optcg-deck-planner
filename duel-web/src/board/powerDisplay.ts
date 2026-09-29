/** Power badge math: printed base power plus the live modifier (DON!!, buffs, debuffs). */

export type PowerBreakdown = {
  /** Printed power (or live power when the printed value is unknown). */
  base: number;
  /** Live power after modifiers. */
  current: number;
  /** current − base; 0 when unmodified. */
  delta: number;
};

export function powerBreakdown(
  power: number | null | undefined,
  printedPower: number | null | undefined,
  atlasPower: number | null | undefined,
): PowerBreakdown | null {
  const base = printedPower ?? atlasPower ?? power ?? null;
  if (base == null) return null;
  const current = power ?? base;
  return { base, current, delta: current - base };
}

/** "+2000" / "−1000" (typographic minus). */
export function formatPowerDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/**
 * Status chips to draw on a tile. Rested field cards are turned sideways, so
 * the "Rested" chip is redundant there.
 */
export function tileStatusLabels(
  labels: string[] | undefined,
  rested: boolean | undefined,
): string[] {
  const all = labels?.length ? labels : rested ? ["Rested"] : [];
  return rested ? all.filter((l) => l !== "Rested") : all;
}
