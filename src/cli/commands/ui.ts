import { detectProject } from "../../project/project-detector.js";
import { startServer, DEFAULT_VIBESTRATE_PORT } from "../../server/server.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
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
      `  ${symbol.arrow()} Run ${color.bold("git init")}, then ${color.bold("vibe init")}.`,
    );
    return 1;
  }

  const port = opts.port ?? DEFAULT_VIBESTRATE_PORT;
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
        isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }

  // One-line-per-component readout so the user can confirm the
  // "vibe ui = everything you need in one shot" at a glance.
  console.log(`${symbol.ok()} ${header("Vibestrate — dashboard + scheduler")}`);
  console.log(
    indent(`${symbol.bullet()} dashboard   ${color.bold(started.url)}`),
  );
  if (started.schedulerPid !== null) {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.green(
          `pid ${started.schedulerPid}`,
        )} ${color.dim("(logs: .vibestrate/scheduler/scheduler.log)")}`,
      ),
    );
  } else if (opts.scheduler === false) {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.dim("disabled — run `vibe queue run` externally")}`,
      ),
    );
  } else {
    console.log(
      indent(
        `${symbol.bullet()} scheduler   ${color.yellow("not started")} ${color.dim(
          "(lock held by another process — see .vibestrate/scheduler/scheduler.log)",
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
          "  ! UI bundle not found — `pnpm build:ui` from the vibestrate source repo, then restart.",
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

  // Track whether we're already shutting down. The first SIGINT/SIGTERM
  // triggers the graceful path with a hard cap; a *second* SIGINT
  // means the user is impatient — bail out immediately so they're
  // never stuck. Without this, the previous build silently hung
  // forever if started.close() got stuck draining the managed
  // scheduler or long-lived SSE clients.
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 6_000;

  const shutdown = async (code: number) => {
    if (shuttingDown) {
      // Second Ctrl+C — force-exit. Console message so the user
      // knows we heard them and chose to stop waiting.
      console.log("");
      console.log(color.dim("Force-exiting (second Ctrl+C)."));
      process.exit(130);
    }
    shuttingDown = true;
    console.log("");
    console.log(
      color.dim(
        "Shutting down (scheduler SIGTERM → SIGKILL after 3s, server close)… press Ctrl+C again to force.",
      ),
    );
    // Hard cap on the graceful close. If something downstream
    // (fastify keep-alive sockets, scheduler subprocess in a stuck
    // syscall) blocks past this, we exit anyway so the user is
    // never trapped.
    const forceTimer = setTimeout(() => {
      console.log(color.dim(`Shutdown took >${SHUTDOWN_TIMEOUT_MS}ms — force-exiting.`));
      process.exit(code === 0 ? 130 : code);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref?.();
    try {
      await started.close();
    } catch {
      // ignore — we're exiting anyway
    }
    clearTimeout(forceTimer);
    if (resolveExit) resolveExit(code);
  };

  process.on("SIGINT", () => void shutdown(130));
  process.on("SIGTERM", () => void shutdown(0));

  return exitPromise;
}
