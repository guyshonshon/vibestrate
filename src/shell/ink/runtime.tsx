import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { buildVibestrateProgram } from "../../cli/index.js";
import { specFromProgram } from "./completion.js";

export type StartInkShellOptions = {
  projectRoot: string;
  refreshMs?: number;
  /** When set, "B" / `:open` inside the shell open this URL in the
   *  user's default browser. Populated by `vibe shell --ui`. */
  uiUrl?: string | null;
};

export async function runInkShell(
  opts: StartInkShellOptions,
): Promise<number> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    // Naming the constraint and stopping there leaves the reader nowhere, and
    // this fires in exactly the places a person is least able to guess: a pipe,
    // a CI step, an editor's task runner.
    const { firstRunMessage } = await import("../../cli/first-run.js");
    process.stdout.write(firstRunMessage("no-tty"));
    return 1;
  }
  // Walk the real command tree once so the prompt's autocomplete always
  // mirrors the actual CLI (commands, subcommands, flags) - no hand-kept list.
  const completionSpec = specFromProgram(buildVibestrateProgram());
  const instance = render(
    <App
      projectRoot={opts.projectRoot}
      refreshMs={opts.refreshMs}
      uiUrl={opts.uiUrl ?? null}
      completionSpec={completionSpec}
    />,
    {
      exitOnCtrlC: true,
    },
  );
  await instance.waitUntilExit();
  return 0;
}
