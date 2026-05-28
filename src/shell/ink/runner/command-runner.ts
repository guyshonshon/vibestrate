// Spawn `vibe <args>` argv-only (never via a shell) and stream
// stdout/stderr back as line events. Used by the panel's command
// runner so the user can invoke any CLI from inside the TUI.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, exec } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveVibestrateBin(): string {
  // src/shell/ink/runner -> ../../../../dist/index.js when running from src
  // dist/index.js itself when running bundled.
  const candidates = [
    path.resolve(HERE, "..", "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "index.js"),
    path.resolve(HERE, "..", "..", "..", "dist", "index.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}

/**
 * Pure: parse a CLI string into argv. Whitespace-split with a tiny
 * support for single + double quoted strings so users can pass
 * `"a phrase"`. No shell expansion (`$VAR`, globs, `;`, `|`, `&` are
 * treated as literal characters).
 *
 * Returns an empty array for empty input, the trimmed argv otherwise.
 */
export function parseArgs(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export type RunResult = {
  exitCode: number | null;
  output: string;
};

/**
 * Run `vibe <args>` from the project root and return the combined
 * stdout + stderr capped at `maxOutputBytes` so a runaway command
 * can't blow up the panel.
 */
export async function runVibestrateCommand(input: {
  projectRoot: string;
  argv: string[];
  onChunk?: (text: string) => void;
  maxOutputBytes?: number;
}): Promise<RunResult> {
  const cap = input.maxOutputBytes ?? 64 * 1024;
  const bin = resolveVibestrateBin();
  return new Promise<RunResult>((resolve) => {
    let buf = "";
    const append = (text: string): void => {
      buf += text;
      if (buf.length > cap) {
        buf = buf.slice(-cap);
      }
      input.onChunk?.(text);
    };
    const child = spawn(process.execPath, [bin, ...input.argv], {
      cwd: input.projectRoot,
      env: { ...process.env, VIBESTRATE_PANEL: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (err) => {
      append(`\n[runner] spawn failed: ${err.message}\n`);
      resolve({ exitCode: -1, output: buf });
    });
    child.on("exit", (code) => {
      resolve({ exitCode: code, output: buf });
    });
  });
}

/**
 * Spawn `vibe <args>` in the background — detached, unref'd, with
 * stdio redirected to /dev/null. Used for long-running invocations
 * like `vibe run …` and `vibe ui` where the user doesn't want
 * the panel to block waiting for output.
 *
 * The child's pid is returned so the caller can show it in a toast.
 */
export function spawnVibestrateDetached(input: {
  projectRoot: string;
  argv: string[];
}): { pid: number | undefined } {
  const bin = resolveVibestrateBin();
  const child = spawn(process.execPath, [bin, ...input.argv], {
    cwd: input.projectRoot,
    env: { ...process.env, VIBESTRATE_PANEL: "1", NO_COLOR: "1" },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  return { pid: child.pid };
}

/**
 * Cross-platform "open this URL in the user's default browser".
 * Best-effort: silently no-ops on platforms we don't recognize so the
 * caller can still print the URL for the user to paste.
 */
export function openInBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string | null = null;
  if (platform === "darwin") cmd = `open ${JSON.stringify(url)}`;
  else if (platform === "win32") cmd = `start "" ${JSON.stringify(url)}`;
  else cmd = `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {
    // ignore: user can still copy the URL from the toast.
  });
}
