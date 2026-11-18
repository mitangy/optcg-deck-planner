import { execSync } from "node:child_process";

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
 * @param {string} name
 * @param {string} sha
 * @param {string} builtAt
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
