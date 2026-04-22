#!/usr/bin/env bash
set -euo pipefail

# Release a new version end-to-end:
#   1. Bump package.json + bun.lock on main
#   2. Commit, tag vX.Y.Z, push
#
# All local work completes before any push, so a failure partway through
# leaves origin untouched. Recovery: git reset --hard origin/main, then rerun.

CURRENT=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

usage() {
  echo "Usage: ./scripts/release.sh [-M | -m | -p | X.Y.Z]"
  echo "  -M     major  ($CURRENT → $((MAJOR + 1)).0.0)"
  echo "  -m     minor  ($CURRENT → $MAJOR.$((MINOR + 1)).0)"
  echo "  -p     patch  ($CURRENT → $MAJOR.$MINOR.$((PATCH + 1)))"
  echo "  X.Y.Z  explicit version"
  exit 1
}

case "${1:-}" in
  -M) VERSION="$((MAJOR + 1)).0.0" ;;
  -m) VERSION="$MAJOR.$((MINOR + 1)).0" ;;
  -p) VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  *)
    if [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      VERSION="$1"
    else
      usage
    fi
    ;;
esac

echo "Releasing: $CURRENT → $VERSION"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "error: must run from main" >&2; exit 1; }
[ -z "$(git status --porcelain -uno)" ] || { echo "error: working tree has uncommitted changes — commit or stash first" >&2; exit 1; }
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  echo "error: tag v$VERSION already exists" >&2
  exit 1
fi

echo "Fetching origin"
git fetch origin
git merge --ff-only origin/main

echo "Bumping package.json and regenerating bun.lock"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
bun install

git add package.json bun.lock
git commit -m "chore: bump version to $VERSION"

git tag "v$VERSION"
echo "Tagged v$VERSION"

echo "Pushing main and tag"
git push origin main
git push origin "v$VERSION"

echo "Released v$VERSION"
