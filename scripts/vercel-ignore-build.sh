#!/usr/bin/env bash
# Vercel "Ignored Build Step" helper (exit 0 = skip build, exit 1 = build).
# Usage: vercel-ignore-build.sh <path> [<path>...]   (paths relative to git repo root)
# Skips non-production builds, and production builds where none of the given
# paths changed between VERCEL_GIT_PREVIOUS_SHA and the current commit.
# The root package.json and package-lock.json are always watched too: both apps
# are npm workspaces installed from that one lockfile, and listing them here keeps
# the ignoreCommand strings under Vercel's 256-character limit (#956).
# packages/card-core is watched the same way: both apps import it (through rules and deck-analytics too).
# So is packages/api-client: both apps send their API calls through it.
# So is tools/vite: both vite configs import the version-file plugin from it.
# Any unexpected condition falls through to building.

cd "$(git rev-parse --show-toplevel)" || { echo "Cannot find repo root, building"; exit 1; }

if [ "$VERCEL_ENV" != "production" ]; then
  echo "VERCEL_ENV=${VERCEL_ENV:-unset} is not production, skipping build"
  exit 0
fi

prev="$VERCEL_GIT_PREVIOUS_SHA"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$prev" ]; then
  echo "No VERCEL_GIT_PREVIOUS_SHA, building"
  exit 1
fi
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "Previous commit $prev not available (shallow clone?), building"
  exit 1
fi

git diff --quiet "$prev" "$cur" -- "$@" package.json package-lock.json packages/card-core packages/api-client tools/vite
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "No changes in $* (or the root lockfile) since ${prev:0:7}, skipping build"
  exit 0
fi
echo "Changes in $* (or the root lockfile) since ${prev:0:7} (git diff exit $rc), building"
exit 1
