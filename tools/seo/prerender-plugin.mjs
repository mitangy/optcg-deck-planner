// Hooking `closeBundle` means Vercel's `npx vite build` needs no buildCommand change.
// The template is saved untouched as `_app.html` before the entry runs: the empty app shell every non-prerendered route is rewritten to, so a private page never flashes the home page's markup.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {{ name: string; entry: string; configFile: string; build: typeof import("vite").build }} opts
 */
export function prerenderPlugin({ name, entry, configFile, build }) {
  let isSsrBuild = false;
  let root = process.cwd();
  let outDir = "";
  return {
    name: `${name}-prerender`,
    apply: "build",
    enforce: "post",
    configResolved(config) {
      isSsrBuild = Boolean(config.build.ssr);
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      // The nested SSR build below loads this same config, so it must not prerender again.
      if (isSsrBuild) return;
      const tmp = path.join(root, "node_modules", `.prerender-${name}`);
      await build({
        root,
        configFile,
        logLevel: "warn",
        publicDir: false,
        build: {
          ssr: entry,
          outDir: tmp,
          emptyOutDir: true,
          minify: false,
          sourcemap: false,
          rollupOptions: { output: { format: "es", entryFileNames: "entry.mjs" } },
        },
        // Workspace packages are source files outside node_modules; bundle them.
        ssr: { noExternal: [/^@optcg\//] },
      });
      try {
        const template = await readFile(path.join(outDir, "index.html"), "utf8");
        await writeFile(path.join(outDir, "_app.html"), template);
        const mod = await import(`${pathToFileURL(path.join(tmp, "entry.mjs")).href}?t=${Date.now()}`);
        const files = await mod.prerender({ template });
        for (const f of files) {
          const target = path.join(outDir, f.file);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, f.content);
        }
        console.log(`[${name}-prerender] wrote ${files.length} files (${files.filter((f) => f.file.endsWith(".html")).length} pages)`);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
  };
}
