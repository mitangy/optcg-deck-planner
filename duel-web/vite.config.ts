import { execSync } from "node:child_process";
import { defineConfig } from "vite";
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

export default defineConfig(() => {
  const gitSha = resolveGitSha();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha),
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
