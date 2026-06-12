import path from "node:path";
import os from "node:os";
import { pathExists, readText } from "../utils/fs.js";

// ── Host Claude Code hook detection (T4) ─────────────────────────────────────
//
// The `claude-code` provider runs the user's own `claude` CLI as a subprocess.
// Unless the provider is started with `--safe-mode` (our opt-in `settings.safe
// Mode`), that CLI loads the operator's settings hierarchy - `~/.claude/
// settings.json` and the project's `.claude/settings*.json` - INCLUDING any
// `hooks`. A `UserPromptSubmit` hook (e.g. a personal "supervisor" directive)
// then fires inside every Vibestrate provider turn: it injects text into the
// prompt, can skew a reviewer's verdict, and burns tokens. We don't isolate by
// default on purpose (the operator's environment is legitimate context), so we
// DETECT + WARN instead - this module is the detection half. It reads ONLY hook
// event names + the file path; it never reads hook command contents (which can
// hold secrets/paths) into a report.

/** Hook configs found in one settings file. `events` are the lifecycle names
 *  (UserPromptSubmit, PreToolUse, Stop, ...) that have at least one matcher. */
export type HostHookSource = {
  /** Display path (absolute or ~-relative) of the settings file. */
  path: string;
  events: string[];
};

/** Settings hooks that actually inject into / wrap a turn (vs purely cosmetic).
 *  UserPromptSubmit is the worst offender (prompt injection); the tool hooks
 *  wrap every tool call. Used only to order the warning's emphasis. */
export const IMPACTFUL_HOOK_EVENTS = new Set([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SubagentStop",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Pure: extract the hook event names from a parsed settings object. A `hooks`
 *  value is an object keyed by event name; an entry counts only when it holds
 *  at least one matcher/config (an empty array/object is inert). */
export function hookEventsOf(settings: unknown): string[] {
  if (!isRecord(settings)) return [];
  const hooks = settings.hooks;
  if (!isRecord(hooks)) return [];
  const events: string[] = [];
  for (const [event, value] of Object.entries(hooks)) {
    const nonEmpty = Array.isArray(value)
      ? value.length > 0
      : isRecord(value)
        ? Object.keys(value).length > 0
        : Boolean(value);
    if (nonEmpty) events.push(event);
  }
  return events.sort();
}

/** Pure: summarize hook sources from already-read settings files. */
export function summarizeHostHooks(
  files: { path: string; json: unknown }[],
): HostHookSource[] {
  const out: HostHookSource[] = [];
  for (const f of files) {
    const events = hookEventsOf(f.json);
    if (events.length > 0) out.push({ path: f.path, events });
  }
  return out;
}

/** The settings files the `claude` CLI loads, in precedence order, that can
 *  carry hooks: the user's home settings and the project's `.claude` settings.
 *  (Enterprise-managed settings exist too but are out of a per-project doctor's
 *  reach.) Paths are returned even when absent; the reader skips missing ones. */
export function hostHookSettingsPaths(projectRoot: string): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".claude", "settings.json"),
    path.join(projectRoot, ".claude", "settings.json"),
    path.join(projectRoot, ".claude", "settings.local.json"),
  ];
}

function displayPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home + path.sep) ? "~" + p.slice(home.length) : p;
}

/** Read the candidate settings files and return the hook sources found.
 *  Best-effort: a missing or unparseable file is skipped, never thrown. */
export async function detectHostHooks(
  projectRoot: string,
): Promise<HostHookSource[]> {
  const files: { path: string; json: unknown }[] = [];
  for (const p of hostHookSettingsPaths(projectRoot)) {
    if (!(await pathExists(p))) continue;
    try {
      files.push({ path: displayPath(p), json: JSON.parse(await readText(p)) });
    } catch {
      // A malformed settings.json is the operator's problem to fix; the hook
      // detector just skips it rather than crashing doctor.
    }
  }
  return summarizeHostHooks(files);
}
