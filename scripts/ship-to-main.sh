#!/usr/bin/env bash
set -euo pipefail

# Ship a feature from dev to main as a 2-parent squash commit.
#
# Usage: ./scripts/ship-to-main.sh <ticket> "<commit subject>"
# Example: ./scripts/ship-to-main.sh ENG-85 "feat(ui): add side radio picker to SetupView"
#
# Requires:
#   - Current branch is main, working tree clean
#   - Tags feat-<ticket>-base and feat-<ticket>-merged exist

usage() {
  echo "Usage: $0 <ticket> <subject>" >&2
  echo "  ticket:  Linear ticket (e.g. ENG-85). Tags feat-<ticket>-{base,merged} must exist." >&2
  echo "  subject: Conventional Commits subject (e.g. \"feat(ui): add X\")" >&2
  exit 1
}

[ $# -eq 2 ] || usage

ticket="$1"
subject="$2"

base_tag="feat-${ticket}-base"
merged_tag="feat-${ticket}-merged"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "error: must run from main" >&2; exit 1; }
[ -z "$(git status --porcelain -uno)" ] || { echo "error: working tree has uncommitted changes" >&2; exit 1; }
git rev-parse --verify "$base_tag^{commit}" >/dev/null 2>&1 || { echo "error: tag $base_tag not found" >&2; exit 1; }
git rev-parse --verify "$merged_tag^{commit}" >/dev/null 2>&1 || { echo "error: tag $merged_tag not found" >&2; exit 1; }

echo "Cherry-picking $base_tag..$merged_tag into staging"
git cherry-pick --no-commit "$base_tag..$merged_tag"

tree=$(git write-tree)
main_parent=$(git rev-parse HEAD)
feat_parent=$(git rev-parse "$merged_tag")

msg=$(printf '%s\n\nRef: %s\n' "$subject" "$ticket")

echo "Building 2-parent squash commit"
echo "  tree:    $tree"
echo "  parent1: $main_parent (main)"
echo "  parent2: $feat_parent ($merged_tag)"

new=$(printf '%s\n' "$msg" | git commit-tree "$tree" -p "$main_parent" -p "$feat_parent")

git reset --hard "$new"

echo
echo "Shipped: $new"
echo "  $subject"
echo
echo "Next:"
echo "  git push"
echo "  git tag v0.x.y && git push --tags   # to deploy"
