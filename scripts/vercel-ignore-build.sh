#!/usr/bin/env bash
# Vercel "Ignored Build Step" helper (exit 0 = skip build, exit 1 = build).
# Usage: vercel-ignore-build.sh <path> [<path>...]   (paths relative to git repo root)
# Skips non-production builds, and production builds where none of the given
# paths changed between VERCEL_GIT_PREVIOUS_SHA and the current commit.
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

git diff --quiet "$prev" "$cur" -- "$@"
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "No changes in $* since ${prev:0:7}, skipping build"
  exit 0
fi
echo "Changes in $* since ${prev:0:7} (git diff exit $rc), building"
exit 1
