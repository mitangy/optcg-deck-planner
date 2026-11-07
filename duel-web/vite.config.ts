import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPlugin } from "../scripts/seo/prerender-plugin.mjs";

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
    plugins: [
      react(),
      versionFile(gitSha, builtAt),
      // Public routes become real HTML in dist/ after the build (#914); see src/prerender/entry.tsx.
      prerenderPlugin({ name: "duel", entry: "src/prerender/entry.tsx", configFile: fileURLToPath(import.meta.url), build }),
    ],
    // @optcg/* packages resolve through the npm workspace symlinks in node_modules (their "exports" map to src/),
    // so there is no alias list here. The main bundle never imports @optcg/rules at runtime (types only); only
    // the lazy replay chunk (src/replay/) imports it, by subpath (@optcg/rules/replayTimeline), never the package index.
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
