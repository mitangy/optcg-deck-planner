/** "Nov 21, 2026" in the viewer's time zone. */
export function seasonDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
