/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPlugin } from "../scripts/seo/prerender-plugin.mjs";

// Production must use the same-origin `/api` rewrite so the session cookie stays
// first-party (absolute cross-origin API URLs break cookies on mobile Safari).
// Fail the production build if VITE_API_URL points at an absolute host.
function assertSameOriginApiUrl(mode: string) {
  if (mode !== "production") return;
  const apiUrl = process.env.VITE_API_URL?.trim();
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    throw new Error(
      `VITE_API_URL="${apiUrl}" is an absolute URL. Leave it unset (or use a ` +
        "relative path like /api) for production builds so API calls stay " +
        "same-origin and session cookies remain first-party.",
    );
  }
}

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
    name: "planner-version-file",
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

export default defineConfig(({ mode }) => {
  assertSameOriginApiUrl(mode);
  const gitSha = resolveGitSha();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [
      react(),
      versionFile(gitSha, new Date().toISOString()),
      // Public routes become real HTML in dist/ after the build (#914); see src/prerender/entry.tsx.
      prerenderPlugin({ name: "planner", entry: "src/prerender/entry.tsx", configFile: fileURLToPath(import.meta.url), build }),
    ],
    define: {
      "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha),
    },
    // e2e/ holds Playwright specs (`npm run e2e`), not unit tests.
    test: { include: ["src/**/*.test.{ts,tsx}"] },
    server: {
      port: 5173,
    },
  };
});
