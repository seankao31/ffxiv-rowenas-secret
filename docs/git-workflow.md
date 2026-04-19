# Git workflow

This repo uses a two-branch model so that `main` reads as a clean release log while `dev` preserves every granular commit.

## Branches

| Branch | Role |
|---|---|
| `main` | One commit per shipped feature. Tagged `v*` for prod. |
| `dev` | `--no-ff` merges of feature branches — one merge commit per feature, granular history preserved on the feature side. |
| `feat/<ticket>-<slug>` | Temporary feature branch. Lives until the feature ships to `main`. |

## Topology

Both `main` and `dev` use **2-parent merge commits** at feature boundaries:

- **`main` squash commit** — parent 1 is the previous squash on main; parent 2 is the dev-side merge commit for that feature. The tree is the cumulative file state after applying the feature's changes to the previous release.
- **`dev` merge commit** — parent 1 is the pre-merge `dev` tip (the feature's base); parent 2 is the feature branch tip. The tree is the fully merged state.

Since main's parent 2 tree is not literally merged in (we cherry-pick only the feature's own commits, not the full dev delta), a main ship is a "squash" in content terms but a "merge" in graph terms. Dev's `--no-ff` merges, in contrast, are real content merges — the merge commit's tree equals the feature tip.

The symmetric result: `--first-parent` on either branch gives you a clean feature-level log.

```
main:   S1 ──── S2 ──── S3 ──── S4 ──── S5       (first-parent chain = release log)
              ↙        ↙      ↙      ↙
dev:   A─────M1─────M2─────M3─────M4─────M5      (first-parent chain = feature log)
          ↖      ↖      ↖      ↖      ↖
           B-C    D-E    F-G-H  I-J    K         (--no-ff merges preserve per-feature commits)
```

Each `S` on main pulls in exactly one feature via the matching dev merge commit `M`; any unshipped dev work stays on dev until its own squash lands on `main`.

## Shipping a feature

### 1. Start work

Create a worktree off the `dev` tip:

```sh
git worktree add .worktrees/<ticket> -b feat/<ticket>-<slug> dev
cd .worktrees/<ticket>
```

Commit freely on the feature branch. Tests, fixups, experiments — all fine, `dev` preserves it.

### 2. Merge to dev with --no-ff

When the feature is done, rebase onto current `dev` tip, then merge with `--no-ff`:

```sh
git switch feat/<ticket>-<slug>
git rebase dev
git switch dev
git merge --no-ff feat/<ticket>-<slug>    # accept the default message
git push
```

Don't pass `-m "..."` to `git merge`. The ship-to-main script discovers the merge by grepping `dev --merges` for the default subject `Merge branch 'feat/<ticket>-<slug>'`; an overridden message will go unmatched and the feature won't be shippable.

The resulting merge commit on `dev` brackets the feature: its first parent is the pre-merge `dev` tip (the feature's base) and its second parent is the feature tip. The merge commit survives deletion of the feature branch and is the durable anchor for the feature's commit range.

### 3. Bake on dev

Features can sit on `dev` alongside each other while they bake. Ship order on `main` doesn't have to match merge order on `dev`.

### 4. Ship to main

Use the helper script, which constructs the 2-parent squash:

```sh
git switch main
./scripts/ship-to-main.sh <ticket> "feat(scope): short subject"
git push
```

The script locates the dev merge commit for the ticket by grepping `dev --merges` for the default merge subject, anchored at the start and with a trailing dash (the anchor rejects body mentions; the dash prevents `ENG-19` from matching `ENG-190`). It then runs the equivalent of:

```sh
MERGE=$(git log dev --merges --extended-regexp \
         --grep="^Merge branch 'feat/<ticket>-" --format=%H)
git cherry-pick --no-commit -m 1 "$MERGE"
TREE=$(git write-tree)
COMMIT=$(printf 'feat(scope): subject\n\nRef: ENG-XX\n' \
  | git commit-tree "$TREE" -p HEAD -p "$MERGE")
git reset --hard "$COMMIT"
```

Two key lines:

- `git cherry-pick -m 1 "$MERGE"` replays the merge's net effect (the diff from `$MERGE^1` to `$MERGE`) as a single patch, so any conflict resolution baked into the merge commit's tree is preserved. A range cherry-pick of `$MERGE^1..$MERGE^2` would drop the resolution, since resolution edits live only in the merge's tree, not in the feature branch's commits.
- `git commit-tree -p HEAD -p "$MERGE"` uses two `-p` flags to make a 2-parent commit. Parent 2 points at dev's merge commit so the graph edge leads directly to the feature's boundary marker on dev — which means `main^2` recovers the dev merge, `main^2^1` recovers the feature's base, and `main^2^2` recovers the feature tip.

### 5. Clean up

```sh
git branch -D feat/<ticket>-<slug>
git worktree remove .worktrees/<ticket>
```

The merge commit on `dev` remains as the feature's permanent anchor.

## Releasing

Shipping a feature doesn't deploy it — only tagging a `v*` on `main` does. Releases bundle one or more shipped features into a single version bump + deploy.

Use `./scripts/release.sh`:

```sh
./scripts/release.sh -p           # patch bump (0.9.0 → 0.9.1)
./scripts/release.sh -m           # minor bump (0.9.0 → 0.10.0)
./scripts/release.sh -M           # major bump (0.9.0 → 1.0.0)
./scripts/release.sh 1.2.3        # explicit version
```

What it does end-to-end:

1. Bumps `package.json` version and regenerates `bun.lock` on `dev`
2. Commits the bump on `dev` as `chore: bump version to X.Y.Z`
3. Ships that bump to `main` as a 2-parent squash (same plumbing as `scripts/ship-to-main.sh`)
4. Tags `vX.Y.Z` on the `main` squash commit
5. Pushes `dev`, `main`, and the tag

All local work finishes before any `git push`, so a failure partway through leaves `origin` untouched. Recovery: `git reset --hard origin/dev` and `git reset --hard origin/main`, then rerun.

The `v*` tag on `main` triggers the deploy workflow in `.github/workflows/`.

## Reading the log

The dual topology means plain `git log main` or `git log dev` walks every reachable commit (including all feature-side commits pulled in as second parents). Use `--first-parent` to skip the second-parent branches:

| What you want to see | Command |
|---|---|
| Release log (one line per shipped feature on main) | `git log main --first-parent` |
| Release log, decorated | `git log main --first-parent --oneline --decorate` |
| Dev feature log (one line per feature merged to dev, plus release bumps) | `git log dev --first-parent` |
| Same, but only what's on main and not on dev | `git log dev..main` |
| Full graph with dev↔main relationships | `git log --all --graph --oneline --decorate` |
| Every commit on dev including per-feature commits | `git log dev` |

Add these aliases if you want shorter commands:

```sh
git config --global alias.main-log "log main --first-parent --oneline --decorate"
git config --global alias.dev-log  "log dev  --first-parent --oneline --decorate"
git config --global alias.graph    "log --all --graph --oneline --decorate"
```

## Tags

| Tag | Purpose | When |
|---|---|---|
| `v0.x.y` | Prod deploy marker | Per release on `main` |

`v*` tags are created by `scripts/release.sh`. Feature boundaries are now encoded in dev's `--no-ff` merge commits, so no per-feature tags are created.

Historical `feat-ENG-{189,190,191}-{base,merged}` tag pairs remain as artifacts of the pre-`--no-ff` era. They cost nothing and are left in place; tooling no longer reads them.

## Rules of thumb

- **Never rewrite `dev` or `main`.** Both are the source of truth.
- **Never `git merge dev` into `main` or vice versa.** It's a no-op (dev is reachable from main), but the intent is wrong — use `ship-to-main.sh` for the real workflow.
- **Never add commits directly to `main` without going through a feature branch.** Even docs or small tweaks should ship via `feat/<ticket>`.
- **Feature branches are ephemeral.** The `--no-ff` merge commit on dev is the durable anchor.
- **Always use `--no-ff` when merging feature branches to dev.** A bare `git merge feat/<ticket>` would fast-forward and erase the feature boundary.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

Scopes map to architectural boundaries, not tickets:

| Scope | Area |
|---|---|
| `server` | `src/lib/server/`, `src/routes/api/` — scanning, scoring, caching, recipes, crafting |
| `ui` | `src/lib/client/`, `src/lib/components/`, `src/routes/` (pages) — Svelte components, client logic |
| `e2e` | `tests/e2e/` — Playwright tests |
| `infra` | Docker, CI/CD, Caddy, deploy scripts |
| _(omit)_ | Docs-only, config, or multi-area changes |

Unit tests follow their source scope (`tests/server/` → `server`, `tests/client/` → `ui`).

Linear ticket references go in a `Ref:` trailer, not in the scope or subject:

```
feat(ui): add side radio picker to SetupView

Ref: ENG-85
```

## Background

- Full design: `docs/superpowers/specs/2026-04-17-git-workflow-and-staging-design.md`
- The initial retroactive rewrite of `main` (2026-04-18) produced the current 108-squash shape.
