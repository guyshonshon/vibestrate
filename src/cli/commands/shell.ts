import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { runInkShell } from "../../shell/ink/runtime.js";
import { buildShellSnapshot } from "../../shell/shell-snapshot.js";
import { isAmacoError } from "../../utils/errors.js";
import {
  startServer,
  DEFAULT_AMACO_PORT,
} from "../../server/server.js";

export function buildShellCommand(): Command {
  const cmd = new Command("shell").description(
    "Interactive panel: live runs, current agent / effort / provider / skills / MCP, queue, with keyboard controls.",
  );

  cmd
    .option("--refresh <ms>", "snapshot refresh interval in ms (default 1000)", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--once",
      "print one snapshot as JSON and exit (useful for scripts / smoke tests)",
    )
    .option(
      "--ui",
      "also start the supervisor dashboard on a background port (visit it from the shell with `B`).",
    )
    .option(
      "--ui-port <port>",
      "port for the supervisor dashboard when --ui is set (default 4317).",
      (v) => parseInt(v, 10),
    )
    .option(
      "--no-open",
      "with --ui, don't open the dashboard in your default browser (default: open).",
    )
    .action(
      async (opts: {
        refresh?: number;
        once?: boolean;
        ui?: boolean;
        uiPort?: number;
        open?: boolean;
      }) => {
        try {
          const detected = await detectProject(process.cwd());
          if (opts.once) {
            const snap = await buildShellSnapshot(detected.projectRoot);
            process.stdout.write(`${JSON.stringify(snap, null, 2)}\n`);
            process.exit(0);
          }

          // Optionally co-launch the dashboard. The shell owns its
          // lifecycle: when the panel exits, we close the server.
          let uiUrl: string | null = null;
          let closeUi: (() => Promise<void>) | null = null;
          if (opts.ui) {
            const started = await startServer({
              projectRoot: detected.projectRoot,
              port: opts.uiPort ?? DEFAULT_AMACO_PORT,
              host: "127.0.0.1",
              withScheduler: true,
            });
            uiUrl = started.url;
            closeUi = started.close;
            if (opts.open !== false) {
              // Lazy import to avoid pulling the runner into the
              // --once path or environments without TTY.
              const { openInBrowser } = await import(
                "../../shell/ink/runner/command-runner.js"
              );
              openInBrowser(uiUrl);
            }
            process.stderr.write(
              `amaco shell: dashboard at ${uiUrl}${opts.open !== false ? " (browser opened)" : ""}\n`,
            );
          }

          let code: number;
          try {
            code = await runInkShell({
              projectRoot: detected.projectRoot,
              refreshMs: opts.refresh,
              uiUrl,
            });
          } finally {
            if (closeUi) await closeUi().catch(() => undefined);
          }
          process.exit(code);
        } catch (err) {
          process.stderr.write(
            `amaco shell: ${
              isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
            }\n`,
          );
          process.exit(1);
        }
      },
    );

  return cmd;
}
