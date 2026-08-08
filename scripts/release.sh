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
# Pushing the tag does NOT publish. There is no release workflow in
# .github/workflows/ (CI only), so the publish is a manual `npm publish` from
# this machine - the script prints the exact command at the end.
#
# npm trusted publishing (OIDC) has to be configured against a package that
# already exists on the registry, so a CI publish workflow can only be added
# after the first manual publish. See .github/MAINTAINING.md.
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

# ── Bump + tag ────────────────────────────────────────────────────────
echo "→ Bumping version ($BUMP)…"
NEW_VERSION="$(npm version "$BUMP" -m "release: v%s")"
echo "  → $NEW_VERSION"

echo "→ Pushing main + tag…"
git push --follow-tags origin main

cat <<EOF

✓ Released $NEW_VERSION.

  Publishing is manual (there is no CI publish workflow). From this machine:
      npm publish --provenance --access public --otp=<your-2fa-code>
EOF
