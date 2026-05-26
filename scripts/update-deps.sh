#!/usr/bin/env bash
#
# Update amaco-os dependencies, then re-validate.
#
# Usage:
#   ./scripts/update-deps.sh            # update within semver ranges
#   ./scripts/update-deps.sh --latest   # update to latest, bumping ranges
#
# After it runs, review the lockfile + package.json diff and commit. It does
# NOT commit anything for you.
set -euo pipefail

cd "$(dirname "$0")/.."

LATEST=""
if [ "${1:-}" = "--latest" ]; then
  LATEST="--latest"
  echo "→ Updating dependencies to LATEST (ranges will change)…"
else
  echo "→ Updating dependencies within current semver ranges…"
fi

pnpm update --recursive $LATEST
pnpm install

echo "→ Audit (prod)…"
if ! pnpm audit --prod; then
  echo "⚠  Audit reported issues — review above. Pin a fix with a pnpm override if needed."
fi

echo "→ Typecheck…"; pnpm typecheck
echo "→ Build…";     pnpm build
echo "→ Test…";      pnpm test

cat <<'EOF'

✓ Dependencies updated and validated.

  Review the changes, then commit:
      git add package.json pnpm-lock.yaml
      git commit -m "chore(deps): update dependencies"

  Cut a release when ready:
      ./scripts/release.sh patch
EOF
