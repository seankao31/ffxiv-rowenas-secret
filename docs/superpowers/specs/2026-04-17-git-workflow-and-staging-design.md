# Git workflow + staging environment

> **Update (2026-04-18):** Post-implementation, the `main`/`dev` topology evolved from "disjoint SHA universes" to **2-parent squash commits** — each squash on `main` has the previous `main` squash as its first parent and the feature's `dev` ship-point as its second parent, so `git log --all --graph` visualizes the `dev`↔`main` relationship. Content semantics (one squash per feature, `main` tree matches `dev` tree at each ship-point) are unchanged. Current-state docs: [`docs/git-workflow.md`](../../git-workflow.md). This spec is kept as the original design record.
>
> **Update (2026-04-18, ENG-192):** Dev now uses `--no-ff` merges for feature branches instead of fast-forward. The merge commit on `dev` encodes the feature boundary in the graph, replacing the `feat-<ticket>-{base,merged}` tag pair — `ship-to-main.sh` derives the cherry-pick range from the merge commit's parents (via `git cherry-pick -m 1`) and `git log dev --first-parent` gives a clean feature-level log mirroring `main --first-parent`. Existing `feat-ENG-{189,190,191}-{base,merged}` tag pairs remain as artifacts of the pre-`--no-ff` era.

## Context

Today the project ships from a single `main` branch. Feature branches are rebased onto `main` and fast-forward merged, so `main` accumulates every granular commit (fixups, typos, work-in-progress) from every feature. Sean wants:

1. A clean `main` whose history reads as one commit per shipped feature.
2. Granular per-feature history preserved *somewhere*, not discarded.
3. A separately-deployable "staging" environment for production-like dogfooding across days, accessible from any device.

Current deploy: `v*` tag push → GitHub Actions builds image, pushes to GHCR, SSHes into Lightsail (single 512 MB instance), `docker compose up -d`. Single Caddy config serves `ffxivrowena.com` and `www.ffxivrowena.com`.

## Goals

- Replace the current single-branch flow with a model that keeps `main` clean and preserves granular history on a separate branch.
- Define the per-feature lifecycle from worktree creation through prod deploy.
- Lay the foundation for a hosted `staging.ffxivrowena.com` environment without actually running it yet, so the future flip is a small, well-scoped change.
- Bump the Lightsail instance to a tier that comfortably hosts the current single-container workload (and, in the future, a second staging container).

## Non-goals

- Automatic tagging or auto-promotion. All tags are manual; Sean decides when to ship.
- Backwards-compatible support for the old "merge straight to main" flow.
- Sharing scanner state or cache between prod and any future staging container.
- Designing the AWS-side procedure for resizing a Lightsail instance (covered by AWS docs; out of scope for this design).

## Branching model

Three classes of branches:

| Branch | Merge style | History | Role |
|---|---|---|---|
| `main` | squash from feature | One commit per shipped feature | Prod release log; tags trigger prod deploy |
| `dev` | fast-forward from feature | Full granular per-feature history | Integration / baking ground; future staging deploy target |
| `feat/<ticket>-<slug>` | (source) | Working commits | Per-feature work; lives until the feature ships to main |

`main` and `dev` are long-lived. They live in **disjoint SHA universes**: a feature exists once on `dev` as N granular commits, and once on `main` as a single squash commit, and git sees them as unrelated ancestors. This is intentional, not a bug — never attempt to merge `dev` into `main` or vice versa.

`feat/*` branches are temporary but **must outlive the FF merge to dev**. They are the only structural marker that says "these N commits are one feature." Without the branch ref, identifying a feature's commit range on a flat `dev` becomes commit-message archaeology.

### Per-feature lifecycle

1. **Create** — `git worktree add .worktrees/eng-XXX -b feat/eng-XXX dev` (off `dev` tip).
2. **Work** — commit freely on `feat/eng-XXX`. Hygiene matters less than usual; granular history is fine.
3. **Promote to dev** — rebase `feat/eng-XXX` onto current `dev` tip, then tag the base (dev tip before FF, captured as `feat-eng-XXX-base`), then on `dev`: `git merge --ff-only feat/eng-XXX`. Push.
4. **Mark merged** — `git tag feat-eng-XXX-merged feat/eng-XXX` as a safety anchor at the merged tip (preserves the SHA if the branch is ever deleted accidentally).
5. **Bake** — feature is now on `dev`. Continue working on other features in parallel; they all bake together on `dev`. (When Phase 2 staging exists, `dev`'s tip auto-deploys to `staging.ffxivrowena.com`.)
6. **Promote to main** — when satisfied, on `main`, extract exactly this feature's commits via a range cherry-pick: `git cherry-pick --no-commit feat-eng-XXX-base..feat-eng-XXX-merged`, then `git commit` with a Conventional Commits subject (e.g. `feat(ui): add cross-world listings filter`) and a `Ref: ENG-XXX` trailer. Push. (Why cherry-pick and not `git merge --squash feat/eng-XXX`: because `main` and `dev` live in disjoint SHA universes, their merge-base is the pre-`dev`-split commit. A `--squash` of `feat/eng-XXX` would therefore stage every other in-flight dev commit too, silently shipping unrelated work on any out-of-order promotion. The `<base>..<merged>` tag pair scopes the squash to this feature's commits only — deterministically, without manual commit-counting.)
7. **Tag for prod** — `git tag v0.x.y && git push --tags`. The `v*` tag triggers the prod deploy workflow.
8. **Clean up** — delete the feature branch and worktree. The `feat-eng-XXX-base` and `feat-eng-XXX-merged` tags remain as permanent anchors to the granular history and to the ship-range.

### Defaults captured here

- **Release granularity:** one squash = one tag = one prod deploy. If multiple baked features should ship together, do consecutive squashes under one tag — but the default is per-feature.
- **Feature branch tag naming:** a pair of lightweight tags per feature — `feat-<ticket>-base` (the dev tip the feature was rebased onto, captured just before FF) and `feat-<ticket>-merged` (the tip after FF). The pair gives `git cherry-pick` a deterministic range at ship time.
- **Squash commit subject:** Conventional Commits, with `Ref:` trailer for the Linear ticket — same convention already in `CLAUDE.md`.

### Branch protection

GitHub branch protection rules on `main` and `dev`:

- Disallow deletion.
- Disallow force pushes.
- (Optional, not required for solo workflow) require PR before merge — Sean can keep direct push permission.

`feat/*` branches are not protected on the remote; the local `feat-*-merged` tag is the safety net.

## Phase 1: branching changes (now)

Implementable today, no infra change beyond the tier bump:

1. **Create `dev` branch** from current `main` tip; push.
2. **GitHub branch protection** on `main` and `dev` (deletion off, force-push off).
3. **Update `CLAUDE.md`** "Git workflow" section to describe the new flow (FF to dev, squash to main, tag for prod).
4. **Bump Lightsail instance to the 2 GB tier.** Justified independently by current measurements: the existing single container's RSS high-water mark is 260 MiB, the box reports 304 MiB swap usage, and `available` memory is 89 MiB — i.e. prod is already swap-thrashing on the 512 MB tier. The 2 GB tier (originally scoped as a Phase 2 prerequisite) is chosen here directly to avoid a second IP-swap outage later; it also gives genuine headroom for the future staging container.
5. **Update existing `.github/workflows/ci.yml` triggers** to also run on pushes/PRs to `dev` (currently scoped to `main`).
6. **Existing `.github/workflows/deploy.yml` is unchanged.** It triggers on `v*` tags, which works identically regardless of which branch carries the tagged commit (it'll be `main` in the new model).

### Verification (Phase 1)

- After the tier bump, re-run the `free -h` + `docker stats` + `VmHWM` checks. Confirm swap usage is now near zero and `available` memory has comfortable headroom (~400+ MiB).
- Walk through the full lifecycle on a small real feature: branch off dev, FF merge to dev, squash to main, tag, prod deploy. Confirm prod deploys identically to today.

## Phase 2: hosted staging (deferred)

Not implemented now. Captured here so the future flip is mechanical.

### Prerequisites

- **Tier bump to 2 GB** — already completed in Phase 1. Worst-case two-container peak is ~710 MiB (260 MiB × 2 + ~180 MiB OS + Caddy); the 2 GB tier (~1.8 GiB usable) gives genuine headroom.
- **DNS:** add an A record `staging.ffxivrowena.com` → Lightsail static IP (Porkbun DNS panel).

### Code/config changes

1. **`docker-compose.yml`** — add a second app service:

   ```yaml
   services:
     app:
       image: ghcr.io/seankao31/ffxiv-rowenas-secret:latest
       restart: unless-stopped

     app_staging:
       image: ghcr.io/seankao31/ffxiv-rowenas-secret:dev
       restart: unless-stopped

     caddy:
       # unchanged
   ```

2. **`Caddyfile`** — add a staging block:

   ```
   ffxivrowena.com, www.ffxivrowena.com {
       reverse_proxy app:3000
   }

   staging.ffxivrowena.com {
       reverse_proxy app_staging:3000
   }
   ```

3. **`.github/workflows/deploy-staging.yml`** — new workflow, triggered on push to `dev`:

   - Build the Docker image, push to GHCR with tag `:dev`.
   - SCP `docker-compose.yml` + `Caddyfile` to Lightsail.
   - SSH into Lightsail: `docker compose pull app_staging && docker compose up -d app_staging`.
   - Reuses the existing `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `GHCR_TOKEN` secrets.

4. **`.github/workflows/deploy.yml`** — unchanged. Still triggered on `v*` tags. Builds `:latest` + `:v0.x.y`. Restarts only the `app` service to avoid touching staging.

### Operational notes (Phase 2)

- Staging runs the **full Universalis scanner** with real data — that's the whole point. Scanner load on Universalis roughly doubles. Universalis has no documented hard rate limit and the scanner already paces itself; this is acceptable.
- Staging and prod each have **independent in-memory cache state**. A staging restart triggers its own warmup cycle.
- Caddy auto-provisions a Let's Encrypt cert for the new subdomain on first request — no manual TLS work.
- **Rollback:** if a baked feature regresses on staging, fix it on `dev` (or revert the FF merge if egregious). Prod is unaffected because nothing has been squashed to `main` yet.

## Open decisions

None blocking implementation. Items below are resolved by defaults captured above; flag if any need revisiting:

- Release granularity → per-feature.
- Feature branch tag naming → `feat-<ticket>-merged`.
- Squash commit format → Conventional Commits + `Ref:` trailer.

## Risks

- **Disjoint SHA universes between `main` and `dev` will look weird in tools that visualize git graphs** (e.g. `git log --graph --all`). This is structural, not a bug — `main` and `dev` are intentionally unrelated histories that share code. Document this clearly in `CLAUDE.md` so future-Sean (and agents) don't try to "fix" it by merging the branches.
- **Forgetting to tag a feature branch as `feat-*-merged` before deletion** loses the SHA anchor. The branch ref will be gone; the commits will still exist (referenced by `dev`'s tip and any descendant commits) but identifying the feature's commit range becomes harder. Mitigation: include the tag step in the lifecycle checklist; consider a git alias or post-merge hook later.
- **Phase 1 tier bump (`512 → 1 GB`) requires brief downtime** during the Lightsail snapshot/resize/IP-swap procedure. Acceptable for a hobby project; schedule for a low-traffic window.
- **Phase 2 tier bump (`1 → 2 GB`) ditto.** Same procedure.

## Out of scope

- Sharing scanner cache between prod and staging (would require non-trivial refactor; not justified for current needs).
- A `staging-on` / `staging-off` runtime toggle to save resources. Once Phase 2 ships, both containers run continuously.
- Multi-environment (dev / staging / canary / prod) flows. Two environments are enough.
- Replacing the SSH-from-GHA deploy mechanism with anything more sophisticated (Watchtower, ArgoCD, etc.). The current mechanism works and the design preserves it.

## Implementation surface

**Phase 1 (now):**

- Create `dev` branch, push.
- GitHub branch protection on `main` + `dev`.
- `CLAUDE.md` — update Git workflow section.
- `.github/workflows/ci.yml` — add `dev` to push/PR triggers.
- Lightsail console — snapshot, resize to 1 GB, restore, swap static IP.

**Phase 2 (deferred):**

- `docker-compose.yml` — add `app_staging` service.
- `Caddyfile` — add `staging.ffxivrowena.com` block.
- `.github/workflows/deploy-staging.yml` — new file.
- `.github/workflows/deploy.yml` — narrow restart to `app` only.
- Porkbun DNS — A record for `staging`.
- Lightsail console — snapshot, resize to 2 GB, restore, swap static IP.
