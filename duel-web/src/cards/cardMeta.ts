export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Purple" or "Red/Green". */
export function colourLabel(colors: readonly string[]): string {
  return colors.map(capitalise).join("/");
}
