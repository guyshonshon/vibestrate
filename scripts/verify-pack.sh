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
require "NOTICE"
# The attribution for the third-party code inlined into the dashboard bundle.
# `files` ships the whole LICENSES directory, so this file rides along with no
# entry of its own - and would leave silently if someone narrowed that entry.
require "LICENSES/third-party-browser.txt"
# The entries below are resolved BY PATH at runtime, not imported, so a bundler
# or `files` change can drop one without breaking the build or any test. Each
# absence is silent and total: no detached runs, no container egress, no default
# roles, no dashboard.
require "dist/run-entry.js"
require "dist/egress-proxy.js"
# One real role file, not the directory: `require` is an exact-line match
# against the tar manifest, which lists files.
require "dist/default-prompts/planner.json"
require "dist/ui/index.html"
# The in-product docs browser (`vibe shell` > Docs) reads docs/content out of
# the INSTALLED package, resolved by walking ancestors from the bundle. That
# walk fails OPEN: with the folder missing it keeps climbing and can land on the
# consuming project's own docs/content, serving those as Vibestrate's. So the
# folder shipping is load-bearing, not cosmetic.
require "docs/content/_nav.json"
require "docs/content/getting-started/quickstart.md"

forbid "sourcemaps (should be trimmed)" '\.map$'
forbid "a node_modules dir"            '^package/node_modules/'
forbid "an env file"                   '^package/\.env'
forbid "test files"                    '(^|/)[^/]*\.test\.[jt]s$'

# Every page the shell's docs index offers has to BE in the tarball. The nav is
# what the browser lists; a slug whose file did not ship is a topic that errors
# when someone selects it, and nothing else checks the two against each other.
echo "-> Checking every navigable doc page shipped..."
tar -xzf "$TARBALL" -C "$WORK" package/docs/content
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(process.argv[1], "package", "docs", "content");
  const nav = JSON.parse(fs.readFileSync(path.join(root, "_nav.json"), "utf8"));
  const slugs = [];
  const walk = (items) => {
    for (const i of items ?? []) {
      // `generated` pages are rendered from docs/generated at build time and
      // have no markdown of their own.
      if (i.slug && !i.generated) slugs.push(i.slug);
      walk(i.items);
    }
  };
  for (const section of nav.sections ?? []) walk(section.items);
  if (slugs.length < 40) throw new Error(`only ${slugs.length} nav slugs - the nav did not parse`);
  const missing = slugs.filter((s) => !fs.existsSync(path.join(root, `${s}.md`)));
  if (missing.length > 0) {
    throw new Error(`the docs nav lists ${missing.length} page(s) the tarball does not ship: ${missing.join(", ")}`);
  }
  console.log(`   ok: all ${slugs.length} navigable doc pages shipped`);
' "$WORK" || { echo "FAIL: the shipped docs nav points at pages that are not in the tarball"; exit 1; }

# `dist/ui/index.html` being present says nothing about the app booting: the
# chunks it loads are content-hashed, so a build that emitted none, or a `files`
# entry that dropped assets/, leaves an index.html referencing nothing. That is
# exactly the shape of failure a blank dashboard has.
echo "-> Checking the dashboard's entry references chunks that shipped..."
tar -xzf "$TARBALL" -C "$WORK" package/dist/ui
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const ui = path.join(process.argv[1], "package", "dist", "ui");
  const html = fs.readFileSync(path.join(ui, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  if (refs.length === 0) throw new Error("index.html references no js/css at all");
  const missing = refs.filter((r) => !fs.existsSync(path.join(ui, r)));
  if (missing.length > 0) {
    throw new Error(`index.html loads ${missing.length} asset(s) not in the tarball: ${missing.join(", ")}`);
  }
  console.log(`   ok: all ${refs.length} dashboard asset(s) referenced by index.html shipped`);
' "$WORK" || { echo "FAIL: the dashboard entry references assets the tarball does not ship"; exit 1; }

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
# The scaffolder copies the bundled role files out of dist/default-prompts. A
# wrong layout there produces a config whose role pointers resolve to nothing,
# and nothing before the project's FIRST RUN would notice - so check the file
# landed, is a role file, and is the one project.yml points at.
ROLE_FILE="$PROJ/.vibestrate/roles/planner.json"
[ -f "$ROLE_FILE" ] || {
  echo "FAIL: vibe init did not scaffold .vibestrate/roles/planner.json"
  ls -la "$PROJ/.vibestrate/roles" 2>&1 | sed 's/^/     /'
  exit 1
}
node -e '
  const fs = require("node:fs");
  const role = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (role.schemaVersion !== 1 || role.id !== "planner" || !role.prompt) {
    throw new Error("scaffolded role file has the wrong shape: " + JSON.stringify(Object.keys(role)));
  }
  const yml = fs.readFileSync(process.argv[2], "utf8");
  if (!yml.includes(".vibestrate/roles/planner.json")) {
    throw new Error("project.yml does not point at the scaffolded role file");
  }
' "$ROLE_FILE" "$PROJ/.vibestrate/project.yml" || {
  echo "FAIL: scaffolded role file / config pointer mismatch"; exit 1
}
[ -z "$(find "$PROJ/.vibestrate/roles" -name '*.md' -print -quit)" ] || {
  echo "FAIL: vibe init wrote a Markdown role file; roles are JSON"
  find "$PROJ/.vibestrate/roles" -name '*.md' | sed 's/^/     /'
  exit 1
}
echo "   ok: vibe init --yes --git-init (scaffolded project.yml + JSON role files)"

echo ""
echo "OK: the published artifact installs from a clean room and runs."
