#!/usr/bin/env bash
set -euo pipefail

# Release the current in-development version, then bump for the next cycle:
#   1. Tag vX.Y.Z on HEAD, where X.Y.Z is the current package.json version
#   2. Bump package.json per the argument (the next in-dev target)
#   3. Commit the bump, push the current branch and the tag
#
# package.json always represents the version currently in development — the
# value ahead of the latest tag, not the value matching it. Hotfix branches
# follow the same pattern: branch from a release tag, bump package.json on the
# first commit to set the branch's in-dev target, then run release.sh.
#
# All local work completes before any push, so a failure partway through
# leaves origin untouched. Recovery: git reset --hard origin/<branch>, then
# rerun.

RELEASE=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "$RELEASE"

usage() {
  echo "Usage: ./scripts/release.sh [-M | -m | -p | X.Y.Z]"
  echo "  Tags v$RELEASE, then bumps package.json to the next in-dev version:"
  echo "    -M     major  ($RELEASE → $((MAJOR + 1)).0.0)"
  echo "    -m     minor  ($RELEASE → $MAJOR.$((MINOR + 1)).0)"
  echo "    -p     patch  ($RELEASE → $MAJOR.$MINOR.$((PATCH + 1)))"
  echo "    X.Y.Z  explicit next in-dev version"
  exit 1
}

case "${1:-}" in
  -M) NEXT="$((MAJOR + 1)).0.0" ;;
  -m) NEXT="$MAJOR.$((MINOR + 1)).0" ;;
  -p) NEXT="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  *)
    if [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      NEXT="$1"
    else
      usage
    fi
    ;;
esac

echo "Releasing: v$RELEASE (then bumping package.json → $NEXT)"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ -z "$(git status --porcelain -uno)" ] || { echo "error: working tree has uncommitted changes — commit or stash first" >&2; exit 1; }
if git rev-parse "v$RELEASE" >/dev/null 2>&1; then
  echo "error: tag v$RELEASE already exists — bump package.json before releasing" >&2
  exit 1
fi

echo "Fetching origin"
git fetch origin
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git merge --ff-only "origin/$BRANCH"
fi

echo "Tagging v$RELEASE"
git tag "v$RELEASE"

echo "Bumping package.json → $NEXT"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEXT\"/" package.json
bun install

git add package.json bun.lock
git commit -m "chore: bump version to $NEXT"

echo "Pushing $BRANCH and v$RELEASE"
git push origin "$BRANCH"
git push origin "v$RELEASE"

echo "Released v$RELEASE; $BRANCH now at in-dev $NEXT"
