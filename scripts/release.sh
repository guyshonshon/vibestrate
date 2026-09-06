#!/usr/bin/env bash
#
# Release vibestrate to npm.
#
# Usage:
#   ./scripts/release.sh [patch|minor|major]   # default: patch
#
# What it does:
#   1. Safety: must be on `main`, clean tree, in sync with origin.
#   2. Gate: install (frozen) → typecheck → build → test → audit → packed-artifact verify.
#   3. Bump: `npm version <bump>` (updates package.json, commits, tags vX.Y.Z).
#   4. Push: `git push --follow-tags origin main`.
#
# Pushing the tag triggers .github/workflows/release.yml, which re-runs this
# same gate and publishes from CI via npm trusted publishing (OIDC) - no stored
# token, and a real provenance attestation. The `release` environment's required
# reviewers hold it for a click first. See .github/MAINTAINING.md.
set -euo pipefail

BUMP="${1:-patch}"
case "$BUMP" in
  patch | minor | major) ;;
  *) echo "✗ bump must be patch | minor | major (got '$BUMP')"; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# ── Safety ────────────────────────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "✗ Release from 'main' (currently on '$BRANCH'). Merge first."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ Working tree is not clean. Commit or stash first."
  git status --short
  exit 1
fi

echo "→ Fetching origin…"
git fetch --quiet origin
if [ "$(git rev-parse @)" != "$(git rev-parse '@{u}')" ]; then
  echo "✗ Local main is not in sync with origin/main. Pull/push first."
  exit 1
fi

# ── Windows is green on what we are about to release ──────────────────
# The local gate below and the release workflow both run on this machine's OS
# and on Linux respectively. Windows is a separate pipeline that nothing waits
# on, so a commit can sit on main, fully green to every gate anyone looks at,
# and be broken on Windows. A tag was cut that way on 2026-09-05.
#
# This checks HEAD, which is the PARENT of what gets tagged: `npm version`
# below makes a fresh `release: vX.Y.Z` commit and tags that. So this proves the
# code being released is green on Windows, not the exact commit the tag names.
# The workflow gate checks the tag's own commit and is what actually protects
# the registry; this one just stops a tag you would otherwise have to delete.
# gh missing is a warning rather than a stop: the workflow gate still holds, and
# this script has no other dependency on gh.
if command -v gh >/dev/null 2>&1; then
  echo "→ Checking CI (Windows) on $(git rev-parse --short HEAD)…"
  WIN_SHA="$(git rev-parse HEAD)"
  WIN="$(gh api "repos/{owner}/{repo}/actions/workflows/ci-windows.yml/runs?head_sha=$WIN_SHA&per_page=1" \
    --jq '.workflow_runs[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)"
  case "$WIN" in
    "completed success")
      echo "  ✓ CI (Windows) passed."
      ;;
    "completed "*)
      echo "✗ CI (Windows) concluded '${WIN#completed }' on this commit."
      echo "  Fix Windows before releasing - a published version cannot be replaced."
      exit 1
      ;;
    "")
      echo "  ! Could not read CI (Windows) status (gh not authenticated?)."
      echo "    The release workflow checks it again and will refuse to publish."
      ;;
    "null null")
      # The API answers with nulls when no run exists for this commit yet.
      echo "✗ No CI (Windows) run for this commit yet."
      echo "  Wait for it to appear and finish, or start one:"
      # workflow_dispatch takes a branch or tag NAME, never a raw SHA.
      echo "    gh workflow run ci-windows.yml --ref main"
      exit 1
      ;;
    *)
      echo "✗ CI (Windows) is '${WIN%% *}' on this commit, not finished."
      echo "  Wait for it, then re-run. Tagging now creates a tag you have to delete."
      exit 1
      ;;
  esac
else
  echo "  ! gh not installed, so CI (Windows) was not checked here."
  echo "    The release workflow checks it and will refuse to publish if it is red."
fi

# ── Gate (mirrors CI) ─────────────────────────────────────────────────
echo "→ Installing (frozen lockfile)…"
pnpm install --frozen-lockfile
echo "→ Typecheck…";  pnpm typecheck
echo "→ Build…";      pnpm build
echo "→ Test…";       pnpm test
echo "→ Audit (prod)…"; pnpm audit --prod
# Verify the PUBLISHED artifact, not just the source tree: pack → clean-room
# install → bin smoke. Catches a bad `files` whitelist or a missing runtime dep
# before we tag. CI runs this too, so the two gates cannot drift apart.
echo "→ Verify packed artifact…"; bash scripts/verify-pack.sh

# ── Generated attribution is current ──────────────────────────────────
# The clean-tree check above ran BEFORE the build, and `pnpm build:ui`
# regenerates LICENSES/third-party-browser.txt. A stale committed copy leaves
# the tree dirty right here, and `npm version` below would refuse with a
# generic "Git working directory not clean" that says nothing about why.
if ! git diff --quiet -- LICENSES; then
  echo "✗ The build regenerated the third-party licence notice, so the copy in"
  echo "  git was out of date. Commit the regenerated file, then re-run."
  git status --short -- LICENSES
  exit 1
fi

# ── Bump + tag ────────────────────────────────────────────────────────
# The gate above ran at the OLD version, and some files are derived from the new
# one: docs/generated/meta.json stamps it, and the README pins an exact version
# in its "stop moving" example. Bumping and tagging in one step therefore tagged
# a tree that failed its own tests/version-single-source.test.ts, and the
# failure only showed up in CI after the tag was already pushed. Bump the
# manifest first, resync what derives from it, and only then commit and tag.
echo "→ Bumping version ($BUMP)…"
npm version "$BUMP" --no-git-tag-version >/dev/null
NEW_VERSION="v$(node -p "require('./package.json').version")"
echo "  → $NEW_VERSION"

echo "→ Resyncing version-derived files…"
sed -i.bak -E 's/("vibestrate": ")[0-9]+\.[0-9]+\.[0-9]+(")/\1'"${NEW_VERSION#v}"'\2/' README.md && rm -f README.md.bak
pnpm docs:generate >/dev/null

echo "→ Re-checking the version gate at $NEW_VERSION…"
npx vitest run tests/version-single-source.test.ts

git add -A
git commit -q -m "release: $NEW_VERSION"
git tag -a "$NEW_VERSION" -m "${NEW_VERSION#v}"

echo "→ Pushing main + tag…"
git push --follow-tags origin main

cat <<EOF

✓ Released $NEW_VERSION.

  The tag push triggers .github/workflows/release.yml, which re-runs this gate
  and publishes from CI via npm trusted publishing - no token on this machine.
  It waits on the \`release\` environment's required reviewers, so approve it:
      https://github.com/guyshonshon/vibestrate/actions

  If the publish step fails on auth, the Trusted Publisher is not configured
  yet - see .github/MAINTAINING.md.
EOF
