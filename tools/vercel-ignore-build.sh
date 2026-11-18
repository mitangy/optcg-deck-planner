#!/usr/bin/env bash
# The root package.json and package-lock.json are always watched: both apps are npm workspaces installed from that one lockfile, and listing them here keeps the ignoreCommand strings under Vercel's 256-character limit.
# packages/card-core, packages/api-client and tools/vite are watched the same way: both apps import them.

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
