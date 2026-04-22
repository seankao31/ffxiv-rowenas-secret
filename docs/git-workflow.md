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

Shipping a feature doesn't deploy it — only tagging a `v*` on `main` does. Releases bundle one or more shipped features into a single version bump + deploy.

Use `./scripts/release.sh`:

```sh
./scripts/release.sh -p           # patch bump (0.9.0 → 0.9.1)
./scripts/release.sh -m           # minor bump (0.9.0 → 0.10.0)
./scripts/release.sh -M           # major bump (0.9.0 → 1.0.0)
./scripts/release.sh 1.2.3        # explicit version
```

What it does end-to-end:

1. Bumps `package.json` version and regenerates `bun.lock` directly on `main`
2. Commits the bump as `chore: bump version to X.Y.Z`
3. Tags `vX.Y.Z` on that commit
4. Pushes `main` and the tag

All local work finishes before any `git push`, so a failure partway through leaves `origin` untouched. Recovery: `git reset --hard origin/main`, then rerun.

The `v*` tag on `main` triggers the deploy workflow in `.github/workflows/`.

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
