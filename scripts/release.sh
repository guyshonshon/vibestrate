#!/usr/bin/env bash
#
# Release vibestrate to npm.
#
# Usage:
#   ./scripts/release.sh [patch|minor|major]   # default: patch
#
# What it does:
#   1. Safety: must be on `main`, clean tree, in sync with origin.
#   2. Gate: install (frozen) → typecheck → build → test → audit.
#   3. Bump: `npm version <bump>` (updates package.json, commits, tags vX.Y.Z).
#   4. Push: `git push --follow-tags origin main`.
#
# Pushing the tag triggers .github/workflows/release.yml, which republishes
# the gate and publishes to npm via OIDC trusted publishing.
#
# If GitHub Actions is unavailable (e.g. billing), publish locally instead —
# the script prints the exact command at the end.
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

# ── Bump + tag ────────────────────────────────────────────────────────
echo "→ Bumping version ($BUMP)…"
NEW_VERSION="$(npm version "$BUMP" -m "release: v%s")"
echo "  → $NEW_VERSION"

echo "→ Pushing main + tag…"
git push --follow-tags origin main

cat <<EOF

✓ Released $NEW_VERSION.

  The tag push triggers .github/workflows/release.yml, which publishes to npm.
  Watch it:   gh run watch --repo guyshonshon/vibestrate

  If Actions is unavailable, publish locally instead:
      npm publish --provenance --access public --otp=<your-2fa-code>
EOF
