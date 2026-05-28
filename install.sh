#!/bin/sh
# Vibestrate installer — installs the `vibestrate` CLI (npm package `vibestrate`) globally.
#
#   curl -fsSL https://raw.githubusercontent.com/guyshonshon/vibestrate/main/install.sh | sh
#
# Pin a version with VIBESTRATE_VERSION before the pipe, e.g.
#   curl -fsSL .../install.sh | VIBESTRATE_VERSION=0.1.1 sh
#
# This script only runs a global npm/pnpm install of a published package —
# nothing else. It is plain text you can read before running.
set -eu

PKG="vibestrate"
VERSION="${VIBESTRATE_VERSION:-latest}"
MIN_NODE_MAJOR=18

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
cyan() { printf '\033[36m%s\033[0m\n' "$*"; }

if ! command -v node >/dev/null 2>&1; then
  red "Node.js is required but was not found."
  red "Install Node >= 18.17 from https://nodejs.org and re-run this installer."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt "$MIN_NODE_MAJOR" ]; then
  red "Node >= $MIN_NODE_MAJOR is required (found $(node -v 2>/dev/null || echo none))."
  red "Upgrade from https://nodejs.org and re-run."
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  cyan "Installing ${PKG}@${VERSION} globally with npm…"
  npm install -g "${PKG}@${VERSION}"
elif command -v pnpm >/dev/null 2>&1; then
  cyan "Installing ${PKG}@${VERSION} globally with pnpm…"
  pnpm add -g "${PKG}@${VERSION}"
else
  red "Neither npm nor pnpm was found. Install Node (it bundles npm) from https://nodejs.org."
  exit 1
fi

cyan ""
cyan "✓ vibestrate installed. Next steps:"
cyan "    cd your-project"
cyan "    vibestrate init"
cyan "    vibestrate doctor --fix"
cyan "    vibestrate run \"your task\""
