import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig(({ mode }) => {
  assertSameOriginApiUrl(mode);
  const gitSha = resolveGitSha();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha),
    },
    server: {
      port: 5173,
    },
  };
});
