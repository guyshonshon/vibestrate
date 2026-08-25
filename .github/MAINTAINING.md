# Maintaining Vibestrate

Notes for the maintainer (you). Releases are maintainer-only - this file is the
playbook so the README doesn't have to instruct it.

## Release a new version

On a clean `main`:

```bash
pnpm release patch    # or minor | major
```

`scripts/release.sh` enforces the guardrails (on `main`, clean tree, in sync
with origin), runs the full gate (typecheck → build → test → audit → packed
artifact verify), then `npm version` (commits + tags `vX.Y.Z`) and pushes main
plus the tag. It does **not** publish - publish manually right after (below).
Releasing is done from a maintainer's machine; publishing runs in CI (see below).

The version lives in `package.json` only and flows into `vibestrate --version` and
the generated docs reference - no other place to bump.

### CI publishing

`.github/workflows/release.yml` publishes to npm on a `v*` tag (or a manual
dispatch) using npm **trusted publishing** (OIDC), so there is no stored token
to leak or rotate, and `--provenance` produces a real attestation - npm only
signs a build it can trace to a supported CI, which is why the flag never
worked from a laptop.

The workflow never bumps a version: it publishes whatever `package.json` says
at the tag, and fails if the tag name disagrees with it. Bumping and tagging
stay a human decision made in the repo (`scripts/release.sh`), so a release
cannot be manufactured by re-running a job.

Two one-time setup steps, both in a browser:

1. npmjs.com → `vibestrate` → Settings → **Trusted Publisher** → GitHub Actions
   → repo `guyshonshon/vibestrate`, workflow `release.yml`. Until this exists
   the publish step fails closed on auth and nothing ships.
2. Repo **Settings → Environments → `release` → Required reviewers** (you), so
   a tag push PAUSES for your click. Without it, a tag publishes unattended.

## Tags and GitHub Releases

**Tags start at `v1.0.0`.** Nothing before 1.0.0 was ever published to npm, so a
backfilled tag would point at a commit that was never a released artifact.
`CHANGELOG.md` carries the pre-1.0 history and stays the record for it; the
stray early-development tag (`v0.1.1`) is not a release of record. Don't
backfill - `git describe` is meaningful from 1.0.0 forward, not before.

From 1.0.0 on, `scripts/release.sh` tags every release (`npm version` creates
`vX.Y.Z`, the push carries it), and each tag gets a GitHub Release cut from it:

```bash
gh release create v1.2.3 --title v1.2.3 --notes "<the matching CHANGELOG.md section>"
```

The changelog section is the release notes - don't write a second, divergent
summary.

## Publish manually

Publish straight from your machine:

```bash
# --tag latest is load-bearing, not decoration. npm's implicit-latest guard
# compares against the HIGHEST version in the packument, not against the
# `latest` dist-tag, and 1.0.1 through 1.1.7 are still published above the 0.x
# line. Without the flag, publishing 0.3.0 refuses or lands off-latest and
# every `npm i vibestrate` keeps serving the old build.
npm publish --provenance --access public --tag latest --otp=<your-2fa-code>
```

`prepublishOnly` builds and strips sourcemaps first, so the tarball stays lean
(~1.7 MB, no `.map` files).

**`--provenance` is EXPERIMENTAL / WIP.** npm mints an attestation only from a
supported CI with OIDC, so the flag can fail from a laptop. It is kept here on
purpose: the moment a publish workflow exists it starts working, and npm only
lets trusted publishing be configured against a package already on the
registry - so the first publish is the one that unblocks it. If it refuses,
drop the flag for that publish and file it, don't quietly make it permanent.

## Update dependencies

```bash
pnpm update-deps            # within semver ranges
pnpm update-deps --latest   # bump ranges to latest
```

Runs the update, re-audits, re-validates, and leaves the diff for you to review
and commit. Pin transitive fixes via `pnpm.overrides` in `package.json` (see the
`ws` pin already there).

## Regenerate docs metadata

After changing the CLI, config schema, providers, guides, workflow, or state
machine:

```bash
pnpm docs:generate
git add docs/generated
```

The output is deterministic; commit it. The marketing site renders these.

## Visibility note

The repo is currently **private**, which is why GitHub Actions is billing-
blocked. Making it public unblocks Actions for free and matches the
Apache-2.0 / open-source posture - a deliberate choice to make when you're
ready.
