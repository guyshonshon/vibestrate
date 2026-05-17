// Spawn `amaco <args>` argv-only (never via a shell) and stream
// stdout/stderr back as line events. Used by the panel's command
// runner so the user can invoke any CLI from inside the TUI.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveAmacoBin(): string {
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
 * Run `amaco <args>` from the project root and return the combined
 * stdout + stderr capped at `maxOutputBytes` so a runaway command
 * can't blow up the panel.
 */
export async function runAmacoCommand(input: {
  projectRoot: string;
  argv: string[];
  onChunk?: (text: string) => void;
  maxOutputBytes?: number;
}): Promise<RunResult> {
  const cap = input.maxOutputBytes ?? 64 * 1024;
  const bin = resolveAmacoBin();
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
      env: { ...process.env, AMACO_PANEL: "1", NO_COLOR: "1" },
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
