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
Releasing is done from a maintainer's machine; there is no CI publish workflow.

The version lives in `package.json` only and flows into `vibestrate --version` and
the generated docs reference - no other place to bump.

### Optional: CI publishing later

No publish workflow exists today (`.github/workflows/` has CI only). If you
ever add one, npm **trusted publishing** (OIDC) lets it publish with no stored
secret:

1. Publish once manually (below) so the package exists.
2. npmjs.com → `vibestrate` → Settings → **Trusted Publisher** → GitHub Actions
   → repo `guyshonshon/vibestrate`, workflow `release.yml`.
3. Gate it behind approval via repo **Settings → Environments → release →
   Required reviewers** so a tag push pauses for your click.

## Publish manually

Publish straight from your machine:

```bash
npm publish --provenance --access public --otp=<your-2fa-code>
```

`prepublishOnly` builds and strips sourcemaps first, so the tarball stays lean
(~1.7 MB, no `.map` files).

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
