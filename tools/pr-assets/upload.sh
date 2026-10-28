#!/usr/bin/env bash
# Upload PR screenshots/recordings to the orphan `pr-assets` branch on origin
# (never merged; keeps binaries out of code branches) and print Markdown to
# paste into a PR body.
#
# Usage: tools/pr-assets/upload.sh <number|slug> <file>...
#   <number>  PR/issue number (digits) or a short slug ([a-z0-9-]+)
#   <file>    any path; stored as <number>/<basename> on pr-assets
#
# Links are pinned to the pushed commit SHA, so they never change under you.
# Markdown goes to stdout, status lines to stderr. Never force-pushes.

set -euo pipefail

BRANCH=pr-assets

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <number|slug> <file>..." >&2
  exit 2
fi

number=$1
shift
if ! [[ "$number" =~ ^[0-9]+$ || "$number" =~ ^[a-z0-9-]+$ ]]; then
  echo "error: <number> must be digits or a slug matching [a-z0-9-]+" >&2
  exit 2
fi

for f in "$@"; do
  [ -f "$f" ] || { echo "error: file not found: $f" >&2; exit 1; }
done

root=$(git rev-parse --show-toplevel)
cd "$root"

# Owner/repo from origin (https or git@ form), with a fallback.
owner_repo=mitangy/optcg-deck-planner
if url=$(git remote get-url origin 2>/dev/null); then
  parsed=$(printf '%s' "$url" | sed -E 's#^(https?://([^/@]+@)?|ssh://git@|git@)[^/:]+[/:]##; s#\.git$##; s#/+$##')
  if [[ "$parsed" =~ ^[^/]+/[^/]+$ ]]; then owner_repo=$parsed; fi
fi

# Run a command, retrying with backoff 2,4,8,16s (up to 5 tries).
retry() {
  local delay=2 i
  for i in 1 2 3 4; do
    if "$@"; then return 0; fi
    echo "retrying in ${delay}s: $*" >&2
    sleep "$delay"
    delay=$((delay * 2))
  done
  "$@"
}

retry git fetch --quiet origin "$BRANCH"

tmp=$(mktemp -d)
cleanup() {
  git -C "$root" worktree remove --force "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

git worktree add --quiet --detach "$tmp" "origin/$BRANCH"

mkdir -p "$tmp/$number"
for f in "$@"; do
  cp -f "$f" "$tmp/$number/$(basename "$f")"
done

git -C "$tmp" add -- "$number"
if git -C "$tmp" diff --cached --quiet; then
  echo "No changes to commit; files already on $BRANCH." >&2
else
  git -C "$tmp" commit --quiet -m "pr-assets: $number ($# files)"
  pushed=0
  for attempt in 1 2 3 4 5; do
    if git -C "$tmp" push --quiet origin "HEAD:refs/heads/$BRANCH"; then
      pushed=1
      break
    fi
    echo "push failed (attempt $attempt/5); fetching and rebasing" >&2
    sleep $((2 ** attempt))
    retry git fetch --quiet origin "$BRANCH"
    git -C "$tmp" rebase --quiet "origin/$BRANCH"
  done
  [ "$pushed" = 1 ] || { echo "error: could not push to $BRANCH" >&2; exit 1; }
fi

sha=$(git -C "$tmp" rev-parse HEAD)

urlencode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"
  else
    printf '%s' "${1// /%20}"
  fi
}

echo "Uploaded $# files to $BRANCH@${sha:0:7}" >&2

for f in "$@"; do
  name=$(basename "$f")
  enc=$(urlencode "$name")
  ext=$(printf '%s' "${name##*.}" | tr '[:upper:]' '[:lower:]')
  stem=${name%.*}
  raw="https://raw.githubusercontent.com/$owner_repo/$sha/$number/$enc"
  case "$ext" in
    png|jpg|jpeg|gif|webp|svg)
      echo "![$stem]($raw)" ;;
    webm|mp4|mov)
      echo "[▶ $name](https://github.com/$owner_repo/blob/$sha/$number/$enc)" ;;
    *)
      echo "[$name]($raw)" ;;
  esac
done
