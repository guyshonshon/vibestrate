import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { runInkShell } from "../../shell/ink/runtime.js";
import { buildShellSnapshot } from "../../shell/shell-snapshot.js";
import { isVibestrateError } from "../../utils/errors.js";

export function buildShellCommand(): Command {
  const cmd = new Command("shell").description(
    "Interactive terminal panel. For the full dashboard + scheduler + browser in one shot, use `vibe ui` instead.",
  );

  cmd
    .option("--refresh <ms>", "snapshot refresh interval in ms (default 1000)", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--once",
      "print one snapshot as JSON and exit (useful for scripts / smoke tests)",
    )
    .action(
      async (opts: { refresh?: number; once?: boolean }) => {
        try {
          const detected = await detectProject(process.cwd());
          if (opts.once) {
            const snap = await buildShellSnapshot(detected.projectRoot);
            process.stdout.write(`${JSON.stringify(snap, null, 2)}\n`);
            process.exit(0);
          }
          const code = await runInkShell({
            projectRoot: detected.projectRoot,
            refreshMs: opts.refresh,
            // The shell honors VIBESTRATE_UI_URL env so `B` can still pop
            // open a separately-running `vibe ui` tab.
            uiUrl: process.env.VIBESTRATE_UI_URL ?? null,
          });
          process.exit(code);
        } catch (err) {
          process.stderr.write(
            `vibe shell: ${
              isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)
            }\n`,
          );
          process.exit(1);
        }
      },
    );

  return cmd;
}
