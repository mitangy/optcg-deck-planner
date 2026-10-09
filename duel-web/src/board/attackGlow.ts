/**
 * Class names for the attack-ready glow (#412). The ring is green, which
 * disappears on green art, so a card with Green among its colours gets the
 * light ring instead (#449). `colors` are the catalog's lowercase names.
 */
export function attackReadyClass(colors: readonly string[]): string {
  return colors.some((c) => c.toLowerCase() === "green") ? "attack-ready attack-ready-light" : "attack-ready";
}
