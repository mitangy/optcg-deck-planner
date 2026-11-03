// Serve a built `dist/` the way Vercel would, using the app's vercel.json routes (#914).
//   node scripts/seo/serve-dist.mjs duel-web [port]      (duel-web/dist, duel-web/vercel.json)
//   node scripts/seo/serve-dist.mjs frontend [port]      (frontend/dist, ./vercel.json)
// `/api/*` answers 502: point the app at a real API with VITE_API_URL at build time instead.
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRequest } from "./vercel-routes.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = process.argv[2] ?? "duel-web";
const port = Number(process.argv[3] ?? (app === "frontend" ? 5190 : 5191));
const dist = path.join(repo, app, "dist");
const config = JSON.parse(readFileSync(path.join(app === "frontend" ? repo : path.join(repo, app), "vercel.json"), "utf8"));

const files = new Set();
(function walk(dir, prefix = "") {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
    else files.add(`${prefix}${name}`);
  }
})(dist);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };

createServer((req, res) => {
  const url = req.url ?? "/";
  const r = resolveRequest(config.routes, files, url);
  if (r.via === "route" && r.file === null) {
    res.writeHead(502).end("no api in the local server");
    return;
  }
  if (!r.file || !files.has(r.file)) {
    res.writeHead(r.status === 200 ? 404 : r.status).end("not found");
    return;
  }
  res.writeHead(r.status, { "content-type": TYPES[path.extname(r.file)] ?? "application/octet-stream" });
  res.end(readFileSync(path.join(dist, r.file)));
  console.log(r.status, url, "->", r.file, `(${r.via})`);
}).listen(port, () => console.log(`serving ${app}/dist on http://localhost:${port}`));
