import { detectProject } from "../../project/project-detector.js";
import { startServer, DEFAULT_AMACO_PORT } from "../../server/server.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";
import { exec } from "node:child_process";

export type UiCommandOptions = {
  port?: number;
  open?: boolean;
  /** When false, skip spawning the managed scheduler subprocess.
   *  Default true: the UI owns the scheduler's lifecycle. */
  scheduler?: boolean;
};

function tryOpenBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string | null = null;
  if (platform === "darwin") cmd = `open ${JSON.stringify(url)}`;
  else if (platform === "win32") cmd = `start "" ${JSON.stringify(url)}`;
  else cmd = `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, (err) => {
    if (err) {
      // ignore — user can copy/paste the URL.
    }
  });
}

export async function runUiCommand(opts: UiCommandOptions): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${process.cwd()} is not inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")}, then ${color.bold("amaco init")}.`,
    );
    return 1;
  }

  const port = opts.port ?? DEFAULT_AMACO_PORT;
  let started;
  try {
    started = await startServer({
      projectRoot: detected.projectRoot,
      port,
      host: "127.0.0.1",
      withScheduler: opts.scheduler !== false,
    });
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }

  // One-line-per-component readout so the user can confirm the
  // "amaco ui = everything you need in one shot" at a glance.
  console.log(`${symbol.ok()} ${header("Amaco — dashboard + scheduler")}`);
  console.log(
    indent(`${symbol.bullet()} dashboard   ${color.bold(started.url)}`),
  );
  if (started.schedulerPid !== null) {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.green(
          `pid ${started.schedulerPid}`,
        )} ${color.dim("(logs: .amaco/scheduler/scheduler.log)")}`,
      ),
    );
  } else if (opts.scheduler === false) {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.dim("disabled — run `amaco queue run` externally")}`,
      ),
    );
  } else {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.yellow("not started")} ${color.dim(
          "(lock held by another process — see .amaco/scheduler/scheduler.log)",
        )}`,
      ),
    );
  }
  console.log(
    indent(
      `${symbol.bullet()} browser     ${
        opts.open
          ? color.green("opening default browser…")
          : color.dim("not opened (--no-open)")
      }`,
    ),
  );
  if (!started.uiAvailable) {
    console.log(
      indent(
        color.yellow(
          "  ! UI bundle not found — `pnpm build:ui` from the amaco source repo, then restart.",
        ),
      ),
    );
  }
  console.log("");
  console.log(color.dim("Press Ctrl+C to stop everything."));

  if (opts.open) tryOpenBrowser(started.url);

  let resolveExit: ((code: number) => void) | null = null;
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  const shutdown = async (code: number) => {
    try {
      await started.close();
    } catch {
      // ignore
    }
    if (resolveExit) resolveExit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  return exitPromise;
}
