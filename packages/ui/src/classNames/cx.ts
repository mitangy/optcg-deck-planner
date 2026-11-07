/** Joins the truthy class names with single spaces: `cx("tile", active && "is-active", extra)`. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
