# Maintaining Amaco

Notes for the maintainer (you). Releases are maintainer-only — this file is the
playbook so the README doesn't have to instruct it.

## Release a new version

On a clean `main`:

```bash
pnpm release patch    # or minor | major
```

`scripts/release.sh` enforces the guardrails (on `main`, clean tree, in sync
with origin), runs the full gate (typecheck → build → test → audit), then
`npm version` (commits + tags `vX.Y.Z`) and pushes the tag. The tag triggers
`.github/workflows/release.yml`, which re-runs the gate and publishes to npm.

The version lives in `package.json` only and flows into `amaco --version` and
the generated docs reference — no other place to bump.

### One-time setup so CI can publish without a token

npm **trusted publishing** (OIDC) lets the workflow publish with no stored
secret:

1. Publish once manually (below) so the package exists.
2. npmjs.com → `amaco-os` → Settings → **Trusted Publisher** → GitHub Actions
   → repo `guyshonshon/amaco`, workflow `release.yml`.
3. After that, `pnpm release` is fully hands-off.

Fallback if you'd rather not use CI / OIDC: an automation token secret
`NPM_TOKEN` on the repo is already wired into the workflow.

### Gate the release behind your approval

`release.yml` runs in the `release` environment. To require your click before
any publish: repo **Settings → Environments → release → Required reviewers** →
add yourself. Then even a tag push pauses for approval.

## Publish manually (no CI)

GitHub Actions is currently billing-blocked (private repo). Until that's sorted
— or any time you prefer — publish straight from your machine:

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
Apache-2.0 / open-source posture — a deliberate choice to make when you're
ready.
