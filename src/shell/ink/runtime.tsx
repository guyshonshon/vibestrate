import React from "react";
import { render } from "ink";
import { App } from "./App.js";

export type StartInkShellOptions = {
  projectRoot: string;
  refreshMs?: number;
};

export async function runInkShell(
  opts: StartInkShellOptions,
): Promise<number> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    process.stdout.write(
      "amaco panel requires an interactive TTY (stdin must be a terminal).\n",
    );
    return 1;
  }
  const instance = render(
    <App projectRoot={opts.projectRoot} refreshMs={opts.refreshMs} />,
    {
      exitOnCtrlC: true,
    },
  );
  await instance.waitUntilExit();
  return 0;
}
