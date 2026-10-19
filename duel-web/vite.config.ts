import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Short SHA for the build tag in the SPA chrome. */
function resolveGitSha(): string {
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
 * uncached to tell whether a newer deploy is live (src/appVersion.ts).
 */
function versionFile(sha: string, builtAt: string): Plugin {
  return {
    name: "duel-version-file",
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

export default defineConfig(() => {
  const gitSha = resolveGitSha();
  const builtAt = new Date().toISOString();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [react(), versionFile(gitSha, builtAt)],
    resolve: {
      // Deck stats, odds and build hints plus the legal footer and pages, shared with the planner; see packages/.
      alias: [
        { find: /^@optcg\/deck-analytics/, replacement: fileURLToPath(new URL("../packages/deck-analytics/src", import.meta.url)) },
        { find: /^@optcg\/site-legal/, replacement: fileURLToPath(new URL("../packages/site-legal/src", import.meta.url)) },
        { find: /^@optcg\/patch-notes/, replacement: fileURLToPath(new URL("../packages/patch-notes/src", import.meta.url)) },
        // The rules engine, for the replay viewer only: import "@optcg/rules/replayTimeline" from the lazy replay chunk, never the package index.
        { find: /^@optcg\/rules/, replacement: fileURLToPath(new URL("../packages/rules/src", import.meta.url)) },
        { find: /^@optcg\/analyst-client/, replacement: fileURLToPath(new URL("../packages/analyst-client/src", import.meta.url)) },
      ],
      // Package sources sit outside this app, so pin React to this app's copy.
      dedupe: ["react", "react-dom"],
    },
    define: {
      "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha),
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(builtAt),
    },
    server: {
      port: 5174,
      host: true,
    },
    preview: {
      port: 5174,
    },
  };
});
