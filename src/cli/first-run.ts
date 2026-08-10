/**
 * What a new install says when it has nothing to show yet.
 *
 * `vibe` with no arguments opens the panel, which is the right answer once a
 * project is set up and useless before that: an empty panel over a project with
 * no config tells a first-time reader nothing about what to type next. npm
 * prints nothing after an install either, and this package ships no lifecycle
 * script to change that - a postinstall hook is arbitrary code at install time,
 * is skipped by `--ignore-scripts`, and fires when vibestrate is somebody's
 * transitive dependency. So the greeting lives here, where the user actually
 * arrived, and cannot be suppressed by how they installed.
 *
 * Also the fallback for the non-interactive case, where the panel cannot open
 * at all. Naming the constraint without naming a way forward is a dead end.
 */
import { pathExists } from "../utils/fs.js";
import { projectConfigPath } from "../utils/paths.js";

/** Has `vibe init` run here? The config file is the thing every command needs. */
export async function isProjectInitialized(projectRoot: string): Promise<boolean> {
  return pathExists(projectConfigPath(projectRoot));
}

export type FirstRunReason = "uninitialized" | "no-tty";

/**
 * The greeting. `reason` only changes the opening line: what someone can do
 * next is the same either way, and that list is the point of the message.
 */
export function firstRunMessage(reason: FirstRunReason): string {
  const opening =
    reason === "no-tty"
      ? [
          "The vibestrate panel needs an interactive terminal, and this is not one.",
          "Everything it does has a command, so nothing here is blocked:",
        ]
      : [
          "Vibestrate supervises the coding CLIs you already have: it opens a git",
          "worktree, walks a crew through the change, runs your own tests as the",
          "referee, and stops before anything merges.",
          "",
          "This project has no vibestrate config yet. To get one:",
        ];

  return [
    "",
    ...opening,
    "",
    "  vibe welcome     guided walkthrough: providers, crew, flows, first run",
    "  vibe init        scaffold .vibestrate/ here and learn the codebase",
    "  vibe doctor      check which provider CLIs are installed and logged in",
    "  vibe ui          open the dashboard in a browser",
    "  vibe --help      every command",
    "",
    "Docs: https://vibestrate.com/docs",
    "",
  ].join("\n");
}
