export function formatBuildTag(sha: string | undefined | null): string {
  const trimmed = (sha ?? "").trim();
  if (!trimmed) return "dev";
  return trimmed.slice(0, 7);
}

export const BUILD_SHA = formatBuildTag(import.meta.env.VITE_GIT_SHA);

export const BUILD_TIME: string | null = import.meta.env.VITE_BUILD_TIME?.trim() || null;

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
