# Git workflow

This repo uses a single-branch model: all feature work branches from `main` and merges back with `--no-ff`.

## Branches

| Branch | Role |
|---|---|
| `main` | All shipped features land here. Tagged `v*` for prod. |
| `feat/<ticket>-<slug>` | Temporary feature branch off main; lives until merged back. |

## Topology

`main` uses `--no-ff` merges at feature boundaries. Each merge commit has:

- First parent: the previous `main` tip (the feature's base).
- Second parent: the feature branch tip.
- Subject: a handcrafted description of what the branch does.

Feature branch commits are preserved and reachable via the second parent. `git log main --first-parent` gives a clean feature-level log of merge subjects.

```
main:   A ──── M1 ──── M2 ──── M3       (first-parent chain = release log)
                  ↖        ↖       ↖
                   B-C      D-E-F    G    (per-feature commits, reachable via ^2)
```

## Shipping a feature

### 1. Start work

Create a worktree off `main`:

```sh
git worktree add .worktrees/<ticket> -b feat/<ticket>-<slug> main
cd .worktrees/<ticket>
```

Commit freely on the feature branch.

### 2. Merge to main with --no-ff

When the feature is done, rebase onto the current `main` tip, then merge with `--no-ff` and a handcrafted subject:

```sh
git switch feat/<ticket>-<slug>
git rebase main
git switch main
git merge --no-ff feat/<ticket>-<slug> -m "$(cat <<'EOF'
feat(scope): describe what this branch does

Ref: ENG-XX
EOF
)"
git push
```

Write the merge subject as a release-log entry — what changed for the user, not what files were touched. Same Conventional Commits format used elsewhere.

### 3. Clean up

```sh
git branch -D feat/<ticket>-<slug>
git worktree remove .worktrees/<ticket>
```

The merge commit on `main` is the permanent anchor for the feature's commit range.

## Releasing

Shipping a feature doesn't deploy it — only tagging a `v*` on `main` does. Releases bundle one or more shipped features into a single tag + version bump + deploy.

`package.json` always represents the **version currently in development** — the value is ahead of the latest tag, not matching it. A release tags what's already in `package.json`, then bumps `package.json` for the next cycle.

Use `./scripts/release.sh`:

```sh
./scripts/release.sh -p           # tag current, bump patch for next in-dev
./scripts/release.sh -m           # tag current, bump minor for next in-dev
./scripts/release.sh -M           # tag current, bump major for next in-dev
./scripts/release.sh 1.2.3        # tag current, set next in-dev to 1.2.3
```

What it does end-to-end (given `package.json = 0.10.0` and argument `-m`):

1. Tags `v0.10.0` on the current HEAD
2. Bumps `package.json` version to `0.11.0` and refreshes `bun.lock`
3. Commits the bump as `chore: bump version to 0.11.0`
4. Pushes the current branch and the tag

All local work finishes before any `git push`, so a failure partway through leaves `origin` untouched. Recovery: `git reset --hard origin/<branch>`, then rerun.

The `v*` tag on `main` triggers the deploy workflow in `.github/workflows/`.

### Hotfixes

A hotfix branch is a release lineage off an older tag — it doesn't merge back to `main`. Main continues its own lineage toward the next minor/major; the hotfix branch exists only to cut patches on the already-released line.

```sh
# Assume main is at 0.11.0-in-dev and we need a hotfix for v0.10.0.
git switch -c hotfix/0.10.x v0.10.0

# First commit on the branch sets the in-dev target for the hotfix lineage.
sed -i '' 's/"version": ".*"/"version": "0.10.1"/' package.json
bun install
git add package.json bun.lock
git commit -m "chore: bump version to 0.10.1"

# Fix commits go here.
# ...

# Release — same script, different branch.
./scripts/release.sh -p    # tags v0.10.1, bumps package.json to 0.10.2
git push -u origin hotfix/0.10.x
```

`release.sh` doesn't require `main` — it pushes whatever branch you're on. The fix itself usually gets cherry-picked or re-implemented on `main` separately, since main's code has diverged.

## Reading the log

| What you want to see | Command |
|---|---|
| Release log (one line per merged feature) | `git log main --first-parent` |
| Release log, decorated | `git log main --first-parent --oneline --decorate` |
| Full graph with feature branches | `git log --all --graph --oneline --decorate` |

Add these aliases if you want shorter commands:

```sh
git config --global alias.main-log "log main --first-parent --oneline --decorate"
git config --global alias.graph    "log --all --graph --oneline --decorate"
```

## Tags

| Tag | Purpose | When |
|---|---|---|
| `v0.x.y` | Prod deploy marker | Per release on `main` |

`v*` tags are created by `scripts/release.sh`.

## Rules of thumb

- **Never rewrite `main`.** It is the source of truth.
- **Never push commits directly to `main` outside a feature merge or release.** Even docs or small tweaks should go through a feature branch.
- **Always use `--no-ff` when merging feature branches to main.** A bare `git merge feat/<ticket>` would fast-forward and erase the feature boundary.
- **Write the merge commit subject to describe the feature.** It is the release-log entry future readers will see — not the branch name.
- **Feature branches are ephemeral.** The `--no-ff` merge commit on main is the durable anchor.

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

The two-branch model (dev + main with 2-parent squash commits) was introduced 2026-04-18 and retired 2026-04-22 (ENG-224) in favour of this simpler topology. Historical design doc: `docs/superpowers/specs/2026-04-17-git-workflow-and-staging-design.md`.
