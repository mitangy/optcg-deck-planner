/** Short git SHA baked in at Vite build time (`VITE_GIT_SHA`). */

export function formatBuildTag(sha: string | undefined | null): string {
  const trimmed = (sha ?? "").trim();
  if (!trimmed) return "dev";
  return trimmed.slice(0, 7);
}

/** Last committed hash for this duel-web bundle (or `"dev"` / `"unknown"`). */
export const BUILD_SHA = formatBuildTag(import.meta.env.VITE_GIT_SHA);

/** ISO time this bundle was built, or null in dev/tests. */
export const BUILD_TIME: string | null = import.meta.env.VITE_BUILD_TIME?.trim() || null;

/** Short local date + time for a build stamp, e.g. "Oct 2, 12:48 AM". */
export function formatBuildTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
