// Shared scaffolding for testing the CLI's interactive wizards.
//
// The `vi.mock("@inquirer/prompts", ...)` factory itself has to stay inline in
// each test file (vitest hoists it above imports, so it cannot reference
// anything declared here). This module only drives mocks the test file already
// created, and carries the pieces every wizard test needs: a scripted answer
// queue, the real ExitPromptError shape a Ctrl-C produces, and a TTY override
// so the interactive branch is reachable from a headless vitest process.

import { ExitPromptError } from "@inquirer/core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export { ExitPromptError };

/** Ctrl-C at a prompt: @inquirer/prompts rejects with this exact error, so
 *  scripting it is the faithful way to test the interrupt path. */
export function ctrlC(): ExitPromptError {
  return new ExitPromptError("User force closed the prompt with 0 null");
}

type PromptConfig = { message?: unknown };
type Implementable = {
  mockImplementation: (fn: (config: PromptConfig) => Promise<unknown>) => unknown;
};

export type ScriptedPrompt = {
  /** The `message` of each prompt actually shown, in order. */
  asked: string[];
};

/**
 * Answer a prompt mock from a fixed script - one entry per call, in order. An
 * entry that is an `Error` is thrown instead of returned, which is how a
 * Ctrl-C (see `ctrlC()`) is placed at an exact point in a wizard.
 *
 * Running off the end of the script throws rather than returning `undefined`:
 * a wizard that asks more questions than the test scripted has changed its
 * behavior, and silently feeding it `undefined` would hide that behind a
 * confusing downstream failure.
 */
export function scriptAnswers(mock: unknown, answers: readonly unknown[]): ScriptedPrompt {
  const target = mock as Implementable;
  const asked: string[] = [];
  let next = 0;
  target.mockImplementation(async (config: PromptConfig) => {
    const message = typeof config?.message === "string" ? config.message : "";
    asked.push(message);
    if (next >= answers.length) {
      throw new Error(
        `unscripted prompt #${next + 1}${message ? `: ${message}` : ""} - the wizard asked more than the test scripted`,
      );
    }
    const answer = answers[next++];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { asked };
}

/** Force the process to look like an interactive terminal so wizards take
 *  their real branch. Returns the restore function; always call it in
 *  `afterEach` - the flags are process-global. */
export function forceInteractiveTTY(): () => void {
  const prevStdin = process.stdin.isTTY;
  const prevStdout = process.stdout.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  return () => {
    Object.defineProperty(process.stdin, "isTTY", { value: prevStdin, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: prevStdout, configurable: true });
  };
}

/** A throwaway directory outside any git repo, so `detectProject` reports
 *  `isGitRepo: false` and the wizards' not-a-repo branches are reachable. */
export async function tempProjectDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Minimal marker that makes `configExists` true without running `vibe init`. */
export async function writeProjectConfig(projectRoot: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, ".vibestrate", "project.yml"), "");
}
