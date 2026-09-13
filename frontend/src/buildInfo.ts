/** Short git SHA baked in at Vite build time (`VITE_GIT_SHA`). */

export function formatBuildTag(sha: string | undefined | null): string {
  const trimmed = (sha ?? "").trim();
  if (!trimmed) return "dev";
  return trimmed.slice(0, 7);
}

/** Last committed hash for this frontend bundle (or `"dev"` / `"unknown"`). */
export const BUILD_SHA = formatBuildTag(import.meta.env.VITE_GIT_SHA);
