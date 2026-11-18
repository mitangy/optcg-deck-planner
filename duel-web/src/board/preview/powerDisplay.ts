export type PowerBreakdown = {
  base: number;
  current: number;
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

export function formatPowerDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

export type CostBreakdown = {
  base: number;
  current: number;
  delta: number;
};

export function costBreakdown(
  fieldCost: number | null | undefined,
  printedCost: number,
): CostBreakdown | null {
  if (fieldCost == null) return null;
  return { base: printedCost, current: fieldCost, delta: fieldCost - printedCost };
}

export function tileStatusLabels(
  labels: string[] | undefined,
  rested: boolean | undefined,
): string[] {
  const all = labels?.length ? labels : rested ? ["Rested"] : [];
  return rested ? all.filter((l) => l !== "Rested") : all;
}
