export function attackReadyClass(colors: readonly string[]): string {
  return colors.some((c) => c.toLowerCase() === "green") ? "attack-ready attack-ready-light" : "attack-ready";
}
