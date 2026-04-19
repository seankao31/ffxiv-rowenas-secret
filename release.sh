#!/usr/bin/env bash
set -euo pipefail

# Release a new version end-to-end:
#   1. Bump package.json + bun.lock on dev
#   2. Ship the bump to main as a 2-parent squash commit
#   3. Tag vX.Y.Z on the main squash
#   4. Push dev, main, and tags
#
# All local work completes before any push, so a failure partway through
# leaves origin untouched. Recovery: reset local dev and main to origin,
# then rerun.
#
# See docs/git-workflow.md for the topology this orchestrates.

CURRENT=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

usage() {
  echo "Usage: ./release.sh [-M | -m | -p | X.Y.Z]"
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

# Pre-flight checks
[ -z "$(git status --porcelain)" ] || { echo "error: working tree is dirty — commit or stash changes first" >&2; exit 1; }
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  echo "error: tag v$VERSION already exists" >&2
  exit 1
fi

echo "Fetching origin"
git fetch origin

# ---- Step 1: bump on dev (local only) ----
echo "Switching to dev and fast-forwarding to origin/dev"
git switch dev
git merge --ff-only origin/dev

BASE_SHA=$(git rev-parse HEAD)

echo "Bumping package.json and regenerating bun.lock"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
bun install

git add package.json bun.lock
git commit -m "chore: bump version to $VERSION"
MERGED_SHA=$(git rev-parse HEAD)

echo "Dev now at $MERGED_SHA (local only)"

# ---- Step 2: ship to main as 2-parent squash (local only) ----
echo "Switching to main and fast-forwarding to origin/main"
git switch main
git merge --ff-only origin/main

echo "Cherry-picking bump into staging"
git cherry-pick --no-commit "$BASE_SHA..$MERGED_SHA"

TREE=$(git write-tree)
MAIN_PARENT=$(git rev-parse HEAD)
MSG=$(printf 'chore: bump version to %s\n' "$VERSION")

echo "Building 2-parent squash commit"
SHIPPED=$(printf '%s\n' "$MSG" | git commit-tree "$TREE" -p "$MAIN_PARENT" -p "$MERGED_SHA")
git reset --hard "$SHIPPED"

echo "Main now at $SHIPPED (local only)"

# ---- Step 3: tag the main squash ----
git tag "v$VERSION"
echo "Tagged v$VERSION"

# ---- Step 4: push everything ----
echo "Pushing dev, main, and tags"
git push --atomic origin dev main
git push origin "v$VERSION"

echo "Released v$VERSION"
