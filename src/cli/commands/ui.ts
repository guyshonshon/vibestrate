import { detectProject } from "../../project/project-detector.js";
import { startServer, DEFAULT_AMACO_PORT } from "../../server/server.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";
import { exec } from "node:child_process";

export type UiCommandOptions = {
  port?: number;
  open?: boolean;
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
    });
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }

  console.log(`${symbol.ok()} ${header("Amaco supervisor running")}`);
  console.log(indent(`${symbol.arrow()} ${color.bold(started.url)}`));
  console.log(indent(`${color.dim(`bound to ${started.host}:${started.port}`)}`));
  if (!started.uiAvailable) {
    console.log(
      indent(
        color.dim(
          "UI bundle not found. Run `pnpm build:ui` from the Amaco source repo.",
        ),
      ),
    );
  }
  console.log("");
  console.log(color.dim("Press Ctrl+C to stop."));

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
