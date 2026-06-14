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
    process.stdout.write(
      "vibestrate panel requires an interactive TTY (stdin must be a terminal).\n",
    );
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
