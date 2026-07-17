#!/usr/bin/env bash
#
# Verify the PUBLISHED npm artifact actually works (T5).
#
# The repo-level gate (typecheck/build/test/audit) tests the SOURCE TREE. It
# never tests the thing users `npm install`: a bad `files` whitelist, a missing
# RUNTIME dependency (one the monorepo's node_modules was masking), a broken
# shebang, or an ESM resolution error all sail straight through it. This script
# packs the real tarball, installs it into a clean-room project from a fresh
# node_modules, and runs the bin - the same path a user hits.
#
#   pack -> manifest assertions -> clean-room install -> bin smoke
#
# Wired into scripts/release.sh (before the version bump) and
# .github/workflows/release.yml (before `npm publish`).
#
# Usage: bash scripts/verify-pack.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# ── Build the publishable artifact (mirror prepublishOnly) ────────────────────
# `npm pack` does NOT run prepublishOnly, so to test what actually ships we build
# and strip sourcemaps ourselves first. This mutates dist/ (drops .map files);
# `pnpm build` restores them.
echo "-> Building + trimming dist (mirror prepublishOnly)..."
pnpm build >/dev/null
node scripts/prepublish-trim.mjs

# ── Pack ──────────────────────────────────────────────────────────────────────
echo "-> npm pack..."
TARBALL_NAME="$(cd "$WORK" && npm pack "$ROOT" --silent)"
TARBALL="$WORK/$TARBALL_NAME"
[ -f "$TARBALL" ] || { echo "FAIL: npm pack did not produce $TARBALL"; exit 1; }
echo "   packed $TARBALL_NAME ($(du -h "$TARBALL" | cut -f1))"

# ── Manifest assertions ───────────────────────────────────────────────────────
# Everything in an npm tarball is rooted under `package/`.
echo "-> Checking tarball manifest..."
MANIFEST="$(tar -tzf "$TARBALL")"

require() {
  if ! grep -qxF "package/$1" <<<"$MANIFEST"; then
    echo "FAIL: tarball is missing required file: $1"
    exit 1
  fi
}
forbid() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" <<<"$MANIFEST"; then
    echo "FAIL: tarball contains forbidden $label:"
    grep -E "$pattern" <<<"$MANIFEST" | sed 's/^/     /'
    exit 1
  fi
}

require "package.json"
require "dist/index.js"
require "README.md"
require "LICENSE"
forbid "sourcemaps (should be trimmed)" '\.map$'
forbid "a node_modules dir"            '^package/node_modules/'
forbid "an env file"                   '^package/\.env'
forbid "test files"                    '(^|/)[^/]*\.test\.[jt]s$'

echo "   manifest ok ($(wc -l <<<"$MANIFEST" | tr -d ' ') entries)"

# ── Clean-room install from the tarball ───────────────────────────────────────
# A fresh project with its OWN node_modules: `npm install <tarball>` pulls
# vibestrate's real runtime deps from the registry, so a dependency the monorepo
# was masking surfaces here as a hard failure.
echo "-> Clean-room install from the tarball..."
SCRATCH="$WORK/scratch"
mkdir -p "$SCRATCH"
(
  cd "$SCRATCH"
  npm init -y >/dev/null 2>&1
  npm install --no-audit --no-fund "$TARBALL" >"$WORK/install.log" 2>&1
) || { echo "FAIL: clean-room install failed"; cat "$WORK/install.log"; exit 1; }

BIN="$SCRATCH/node_modules/.bin/vibe"
BIN_ALIAS="$SCRATCH/node_modules/.bin/vibestrate"
[ -x "$BIN" ] || { echo "FAIL: vibe bin missing/not executable at $BIN"; exit 1; }
[ -x "$BIN_ALIAS" ] || { echo "FAIL: vibestrate bin missing at $BIN_ALIAS"; exit 1; }

# ── Bin smoke ─────────────────────────────────────────────────────────────────
# Each command must exit 0 AND not emit a module-resolution error (a missing
# runtime dep often EXITS 0 but logs ERR_MODULE_NOT_FOUND on a lazy import).
MODULE_ERR='ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|Cannot find (module|package)'
smoke() {
  local label="$1"; shift
  local out rc
  out="$("$@" 2>&1)" && rc=0 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: $label exited $rc"
    echo "$out" | sed 's/^/     /'
    exit 1
  fi
  if grep -qE "$MODULE_ERR" <<<"$out"; then
    echo "FAIL: $label printed a module-resolution error:"
    grep -E "$MODULE_ERR" <<<"$out" | sed 's/^/     /'
    exit 1
  fi
  echo "   ok: $label"
}

smoke "vibe --version" "$BIN" --version
smoke "vibe --help" "$BIN" --help
smoke "vibestrate --version" "$BIN_ALIAS" --version

# init in a fresh, non-git scratch project (so --git-init exercises that path too).
PROJ="$WORK/proj"
mkdir -p "$PROJ"
(cd "$PROJ" && "$BIN" init --yes --git-init) >"$WORK/init.log" 2>&1 \
  || { echo "FAIL: vibe init --yes --git-init exited non-zero"; cat "$WORK/init.log"; exit 1; }
if grep -qE "$MODULE_ERR" "$WORK/init.log"; then
  echo "FAIL: vibe init printed a module-resolution error:"; cat "$WORK/init.log"; exit 1
fi
[ -f "$PROJ/.vibestrate/project.yml" ] || {
  echo "FAIL: vibe init did not scaffold .vibestrate/project.yml"; cat "$WORK/init.log"; exit 1
}
echo "   ok: vibe init --yes --git-init (scaffolded .vibestrate/project.yml)"

echo ""
echo "OK: the published artifact installs from a clean room and runs."
