# Release Process

## Publishing a release

Run `release.sh` with a semver bump flag or an explicit version:

```bash
./release.sh -p        # patch: 0.6.3 → 0.6.4
./release.sh -m        # minor: 0.6.3 → 0.7.0
./release.sh -M        # major: 0.6.3 → 1.0.0
./release.sh 1.0.0     # explicit version
```

The script:

1. Updates `version` in `package.json` (the single source of truth for app version)
2. Regenerates `bun.lock` to stay in sync
3. Commits, tags `vX.Y.Z`, and pushes

The tag push triggers the Deploy workflow (`.github/workflows/deploy.yml`), which builds a Docker image and deploys it to the server.

> **Note:** `release.sh` uses macOS/BSD `sed` syntax (`sed -i ''`).

## Guards

The script aborts if:

- The working tree has uncommitted changes
- The target tag already exists
