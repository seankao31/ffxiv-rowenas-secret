#!/usr/bin/env bash
set -euo pipefail

# Ship a feature from dev to main as a 2-parent squash commit.
#
# Usage: ./scripts/ship-to-main.sh <ticket> "<commit subject>"
# Example: ./scripts/ship-to-main.sh ENG-85 "feat(ui): add side radio picker to SetupView"
#
# Requires:
#   - Current branch is main, working tree clean
#   - Exactly one --no-ff merge commit on dev whose message references feat/<ticket>

usage() {
  echo "Usage: $0 <ticket> <subject>" >&2
  echo "  ticket:  Linear ticket (e.g. ENG-85). Must match exactly one --no-ff merge on dev." >&2
  echo "  subject: Conventional Commits subject (e.g. \"feat(ui): add X\")" >&2
  exit 1
}

[ $# -eq 2 ] || usage

ticket="$1"
subject="$2"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "error: must run from main" >&2; exit 1; }
[ -z "$(git status --porcelain -uno)" ] || { echo "error: working tree has uncommitted changes" >&2; exit 1; }

# Locate the dev-side merge commit for this feature. The default message for
# `git merge --no-ff feat/<ticket>-<slug>` is "Merge branch 'feat/<ticket>-<slug>'",
# so grepping dev's merges for "feat/<ticket>-" pinpoints the boundary commit.
# The trailing dash is load-bearing: it prevents ENG-19 from matching ENG-190.
matches=$(git log dev --merges --grep="feat/${ticket}-" --format=%H)
match_count=$(printf '%s' "$matches" | grep -c . || true)

if [ "$match_count" -eq 0 ]; then
  echo "error: no --no-ff merge commit on dev matches feat/$ticket" >&2
  echo "       Did you run 'git merge --no-ff feat/$ticket-<slug>' on dev?" >&2
  exit 1
elif [ "$match_count" -gt 1 ]; then
  echo "error: multiple merge commits on dev match feat/$ticket — cannot disambiguate:" >&2
  printf '%s\n' "$matches" | xargs -n1 -I{} git log -1 --format='  %h %s' {} >&2
  exit 1
fi

merge_commit="$matches"

# Defensive: confirm it's a 2-parent merge before using parent shorthand
parent_count=$(git rev-list --parents -n 1 "$merge_commit" | awk '{print NF-1}')
[ "$parent_count" -eq 2 ] || { echo "error: $merge_commit is not a 2-parent merge (has $parent_count parents)" >&2; exit 1; }

echo "Found dev merge commit $(git rev-parse --short "$merge_commit")"
echo "  base (pre-merge dev): $(git rev-parse --short "$merge_commit^1")"
echo "  feat tip:             $(git rev-parse --short "$merge_commit^2")"
echo
# Replay the merge's net effect on main. Using 'cherry-pick -m 1 <merge>'
# applies the full M^1→M diff as a single patch, so any conflict resolution
# baked into the merge commit's tree comes along. A range cherry-pick of
# M^1..M^2 would drop the resolution since it lives only in M's tree.
echo "Cherry-picking dev merge effect (mainline = parent 1) into staging"
git cherry-pick --no-commit -m 1 "$merge_commit"

tree=$(git write-tree)
main_parent=$(git rev-parse HEAD)

msg=$(printf '%s\n\nRef: %s\n' "$subject" "$ticket")

echo "Building 2-parent squash commit"
echo "  tree:    $tree"
echo "  parent1: $main_parent (main)"
echo "  parent2: $merge_commit (dev merge)"

new=$(printf '%s\n' "$msg" | git commit-tree "$tree" -p "$main_parent" -p "$merge_commit")

git reset --hard "$new"

echo
echo "Shipped: $new"
echo "  $subject"
echo
echo "Next:"
echo "  git push"
echo "  # then release with: ./scripts/release.sh [-M | -m | -p | X.Y.Z]"
