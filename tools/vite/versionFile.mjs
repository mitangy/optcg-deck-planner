// Vite plugin and helper shared by frontend/vite.config.ts and duel-web/vite.config.ts: which commit
// a deploy was built from. The running app polls /version.json (packages/ui/src/appShell/appVersion.ts).
import { execSync } from "node:child_process";

/** Short SHA for the build tag in the SPA chrome. */
export function resolveGitSha() {
  const fromEnv =
    process.env.VITE_GIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.CF_PAGES_COMMIT_SHA?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Emits `/version.json` next to the bundle. The running app fetches it
 * uncached to tell whether a newer deploy is live.
 * @param {string} name plugin name, e.g. "planner-version-file"
 * @param {string} sha
 * @param {string} builtAt ISO time of this build
 * @returns {import("vite").Plugin}
 */
export function versionFile(name, sha, builtAt) {
  return {
    name,
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ sha, builtAt })}\n`,
      });
    },
  };
}
