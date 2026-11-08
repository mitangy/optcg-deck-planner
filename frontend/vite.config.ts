/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { build, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPlugin } from "../tools/seo/prerender-plugin.mjs";
import { resolveGitSha, versionFile } from "../tools/vite/versionFile.mjs";

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

export default defineConfig(({ mode }) => {
  assertSameOriginApiUrl(mode);
  const gitSha = resolveGitSha();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [
      react(),
      versionFile("planner-version-file", gitSha, new Date().toISOString()),
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
