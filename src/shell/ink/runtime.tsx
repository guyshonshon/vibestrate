import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { buildVibestrateProgram } from "../../cli/index.js";
import { specFromProgram } from "./completion.js";
import { enterAltScreen, processAltScreenIo } from "./alt-screen.js";

export type StartInkShellOptions = {
  projectRoot: string;
  refreshMs?: number;
  /** When set, "B" / `:open` inside the shell open this URL in the
   *  user's default browser. Populated by `vibe shell --ui`. */
  uiUrl?: string | null;
  /** Draw in the terminal's alternate buffer, filling the window instead of
   *  rendering inline. Off by default - see alt-screen.ts for why. */
  fullScreen?: boolean;
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
  // Entered BEFORE the first frame and restored in a `finally`, so a throw
  // inside the app cannot leave the terminal in the alternate buffer with the
  // user's scrollback hidden.
  const alt = opts.fullScreen ? enterAltScreen(processAltScreenIo()) : null;
  try {
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
  } finally {
    alt?.leave();
  }
}
