import { fileURLToPath } from "node:url";
import { build, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPlugin } from "../tools/seo/prerender-plugin.mjs";
import { resolveGitSha, versionFile } from "../tools/vite/versionFile.mjs";

export default defineConfig(() => {
  const gitSha = resolveGitSha();
  const builtAt = new Date().toISOString();
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [
      react(),
      versionFile("duel-version-file", gitSha, builtAt),
      prerenderPlugin({ name: "duel", entry: "src/prerender/entry.tsx", configFile: fileURLToPath(import.meta.url), build }),
    ],
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
