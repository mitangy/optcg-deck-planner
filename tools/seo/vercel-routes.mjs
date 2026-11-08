// A small model of how Vercel answers a request for a static site with a `routes` table (#914).
// Used by serve-dist.mjs (to look at a build locally) and by the route tests.
//
// Order, as the Vercel docs describe it: routes before `{"handle": "filesystem"}` run first; then a file
// in the output that matches the path is served (a directory serves its index.html); then the routes
// after the handler run, and the first whose `src` matches wins. A `dest` is a file in the output, and
// `status` is the response code (404 pages still send the file in `dest`).

const stripQuery = (p) => p.split(/[?#]/)[0];

/**
 * @param {{ src?: string; dest?: string; status?: number; handle?: string; check?: boolean }[]} routes
 * @param {ReadonlySet<string>} files output files without a leading slash, e.g. "leaders/index.html"
 * @param {string} rawPath request path
 * @param {{ directoryIndex?: boolean }} [opts] directoryIndex (default true): a path that names a directory serves its index.html.
 *   Turn it off to see what the routes alone give when the platform does not do that.
 * @returns {{ file: string | null; status: number; via: "filesystem" | "route" | "none"; src?: string }}
 */
export function resolveRequest(routes, files, rawPath, { directoryIndex = true } = {}) {
  const path = stripQuery(rawPath);
  const rel = path.replace(/^\/+/, "");
  const candidates = [rel];
  if (directoryIndex) candidates.push(`${rel.replace(/\/+$/, "")}/index.html`.replace(/^\//, ""));
  const idx = routes.findIndex((r) => r.handle === "filesystem");
  const before = idx < 0 ? [] : routes.slice(0, idx);
  const after = idx < 0 ? routes : routes.slice(idx + 1);
  const substitute = (dest, m) => dest.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? "").replace(/^\//, "");
  const match = (list, current) => {
    for (const r of list) {
      if (!r.src) continue;
      const m = new RegExp(`^${r.src}$`).exec(current);
      if (m) return { r, m };
    }
    return null;
  };
  const early = match(before, path);
  if (early) return { file: null, status: early.r.status ?? 200, via: "route", src: early.r.src };
  for (const c of candidates) if (c && files.has(c)) return { file: c, status: 200, via: "filesystem" };

  // `check: true` routes rewrite and then look for the file; when it is missing the rewritten path goes on to the later routes.
  let current = path;
  let start = 0;
  for (;;) {
    const rest = after.slice(start);
    const hit = match(rest, current);
    if (!hit) return { file: null, status: 404, via: "none" };
    const dest = hit.r.dest ? substitute(hit.r.dest, hit.m) : null;
    if (hit.r.check && dest !== null && !files.has(dest)) {
      current = `/${dest}`;
      start += rest.indexOf(hit.r) + 1;
      continue;
    }
    return { file: dest, status: hit.r.status ?? 200, via: "route", src: hit.r.src };
  }
}
