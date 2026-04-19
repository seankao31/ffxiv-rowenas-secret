# Git workflow

This repo uses a two-branch model so that `main` reads as a clean release log while `dev` preserves every granular commit.

## Branches

| Branch | Role |
|---|---|
| `main` | One commit per shipped feature. Tagged `v*` for prod. |
| `dev` | Fast-forward merges of feature branches — full granular history. |
| `feat/<ticket>-<slug>` | Temporary feature branch. Lives until the feature ships to `main`. |

## Topology

Every squash commit on `main` is a **2-parent merge commit**:

- **Parent 1** — the previous squash on `main` (the first-parent chain is the release log)
- **Parent 2** — the feature's ship-point SHA on `dev` (the graph edge that makes `git log --all --graph` show which dev history each release pulled in)
- **Tree** — the cumulative file state after applying the feature's changes to the previous release

Since parent 2's tree is not literally merged in (we cherry-pick only the feature's own commits, not the full dev delta), this is a "squash" in content terms but a "merge" in graph terms. You get both a tidy release log and a visible dev↔main relationship.

```
main:   S1 ──── S2 ──── S3 ──── S4 ──── S5       (first-parent chain = release log)
              ↙        ↙      ↙      ↙
dev:   A─B─C─D────E────F──G──H────I──J──K        (every granular commit preserved)
```

Each `S` pulls in exactly one feature from dev; any unshipped dev work stays on dev until its own squash lands on `main`.

## Shipping a feature

### 1. Start work

Create a worktree off the `dev` tip:

```sh
git worktree add .worktrees/<ticket> -b feat/<ticket>-<slug> dev
cd .worktrees/<ticket>
```

Commit freely on the feature branch. Tests, fixups, experiments — all fine, `dev` preserves it.

### 2. Fast-forward to dev

When the feature is done, rebase onto current `dev` tip, tag the base, then fast-forward merge:

```sh
git switch feat/<ticket>-<slug>
git rebase dev
git tag feat-<ticket>-base dev      # dev tip == feature's base, captured before FF
git switch dev
git merge --ff-only feat/<ticket>-<slug>
git push
git tag feat-<ticket>-merged feat/<ticket>-<slug>
git push --tags
```

The `feat-<ticket>-base` and `feat-<ticket>-merged` tags bracket the feature's commits on `dev` for the later ship step. They survive deletion of the feature branch.

### 3. Bake on dev

Features can sit on `dev` alongside each other while they bake. Ship order on `main` doesn't have to match FF order on `dev`.

### 4. Ship to main

Use the helper script, which constructs the 2-parent squash:

```sh
git switch main
./scripts/ship-to-main.sh <ticket>-<slug> "feat(scope): short subject" ENG-<ticket>
git push
```

The script runs the equivalent of:

```sh
git cherry-pick --no-commit feat-<ticket>-base..feat-<ticket>-merged
TREE=$(git write-tree)
COMMIT=$(printf 'feat(scope): subject\n\nRef: ENG-XX\n' \
  | git commit-tree "$TREE" -p HEAD -p feat-<ticket>-merged)
git reset --hard "$COMMIT"
```

The key line is the `git commit-tree -p HEAD -p feat-<ticket>-merged` — two `-p` flags make it a 2-parent commit.

### 5. Clean up

```sh
git branch -D feat/<ticket>-<slug>
git worktree remove .worktrees/<ticket>
```

The `feat-<ticket>-base` and `feat-<ticket>-merged` tags stay.

## Releasing

Shipping a feature doesn't deploy it — only tagging a `v*` on `main` does. Releases bundle one or more shipped features into a single version bump + deploy.

Use `./release.sh`:

```sh
./release.sh -p           # patch bump (0.9.0 → 0.9.1)
./release.sh -m           # minor bump (0.9.0 → 0.10.0)
./release.sh -M           # major bump (0.9.0 → 1.0.0)
./release.sh 1.2.3        # explicit version
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

The dual topology means `git log main` alone is noisy — it walks every reachable commit, including every dev commit pulled in as a second parent (~500 commits at a time). Use one of these instead:

| What you want to see | Command |
|---|---|
| The release log (one line per shipped feature) | `git log main --first-parent` |
| The release log, decorated | `git log main --first-parent --oneline --decorate` |
| Same, but only what's on main and not on dev | `git log dev..main` |
| Full graph with dev↔main relationships | `git log --all --graph --oneline --decorate` |
| Just the dev line | `git log dev` |

Add these aliases if you want shorter commands:

```sh
git config --global alias.main-log "log main --first-parent --oneline --decorate"
git config --global alias.graph "log --all --graph --oneline --decorate"
```

## Tags

| Tag | Purpose | When |
|---|---|---|
| `v0.x.y` | Prod deploy marker | Per release on `main` |
| `feat-<ticket>-base` | dev tip at feature fork point | Before FF'ing feature to dev |
| `feat-<ticket>-merged` | SHA of feature's last commit | After FF'ing feature to dev |

All tags are manual. No automation adds tags on your behalf.

## Rules of thumb

- **Never rewrite `dev` or `main`.** Both are the source of truth.
- **Never `git merge dev` into `main` or vice versa.** It's a no-op (dev is reachable from main), but the intent is wrong — use `ship-to-main.sh` for the real workflow.
- **Never add commits directly to `main` without going through a feature branch.** Even docs or small tweaks should ship via `feat/<ticket>`.
- **Feature branches are ephemeral.** The `feat-*` tag pair is the durable anchor.

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
