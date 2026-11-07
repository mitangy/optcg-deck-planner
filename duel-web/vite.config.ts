import { fileURLToPath } from "node:url";
import { build, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { prerenderPlugin } from "../scripts/seo/prerender-plugin.mjs";
import { resolveGitSha, versionFile } from "../tools/vite/versionFile.mjs";

export default defineConfig(() => {
  const gitSha = resolveGitSha();
  const builtAt = new Date().toISOString();
  // Bake the commit into import.meta.env.VITE_GIT_SHA for the UI build tag.
  process.env.VITE_GIT_SHA = gitSha;
  return {
    plugins: [
      react(),
      versionFile("duel-version-file", gitSha, builtAt),
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
