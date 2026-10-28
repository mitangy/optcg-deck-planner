#!/usr/bin/env node
/**
 * Fails a pull request that ADDS screenshots or recordings outside the places
 * app media legitimately lives (#783).
 *
 *   git diff --no-renames --diff-filter=A --name-only <base> HEAD | node tools/ci/pr-media.cjs
 *
 * PR screenshots and recordings go on the `pr-assets` branch, not in code
 * branches. A media file is allowed when one of its directories is `public`
 * or `assets`, or ends in `-snapshots` (Playwright baselines). That covers duel-web/public, frontend/public, frontend/src/assets,
 * mobile/assets/images and frontend/e2e/*.spec.ts-snapshots.
 */
"use strict";

const MEDIA_RE = /\.(png|jpe?g|gif|webp|avif|bmp|webm|mp4|mov)$/i;

/** @param {string} dir one directory segment of a path */
const allowedDir = (dir) => dir === "public" || dir === "assets" || dir.endsWith("-snapshots");

/** @param {string[]} paths repo-relative added paths @returns {string[]} media paths that are not allowed */
function blockedMedia(paths) {
  return paths
    .map((p) => p.trim().replace(/^\.\//, ""))
    .filter(Boolean)
    .filter((p) => MEDIA_RE.test(p) && !p.split("/").some(allowedDir));
}

module.exports = { MEDIA_RE, blockedMedia };

if (require.main === module) {
  const blocked = blockedMedia(require("fs").readFileSync(0, "utf8").split("\n"));
  if (!blocked.length) {
    console.log("No screenshots or recordings added.");
  } else {
    for (const p of blocked) console.log(p);
    console.log(
      "\nThis PR adds screenshots or recordings outside public/, assets/ and *-snapshots/ folders. " +
        "Do not commit them to code branches: put them on the `pr-assets` branch with " +
        "`tools/pr-assets/upload.sh <PR-or-issue-number> <files>` and paste the printed Markdown " +
        'into the PR body (see CLAUDE.md "PR screenshots and recordings").',
    );
    process.exit(1);
  }
}
